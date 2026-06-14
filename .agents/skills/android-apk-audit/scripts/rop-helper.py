#!/usr/bin/env python3
"""
ROP Chain Helper for Android Pentesting

This script helps pentesters find ROP (Return-Oriented Programming) gadgets
in native Android libraries. It is a reference implementation, not a full
ROP chain generator.

IMPORTANT: This is for EDUCATIONAL PURPOSES and AUTHORIZED SECURITY TESTING ONLY.
Always obtain proper authorization before testing any systems.

Usage:
    python3 rop-helper.py --library libtarget.so --arch arm64
    python3 rop-helper.py --library libtarget.so --arch arm64 --gadget "pop {x0, x1, lr}"
    python3 rop-helper.py --library libtarget.so --arch arm64 --output gadgets.txt

Requirements:
    - capstone (pip install capstone)
    - Optional: ropgadget (pip install ropgadget)
    - Optional: ropper (pip install ropper)

Exit codes:
    0 - Success
    1 - Error
    2 - Missing dependencies
"""

import sys
import os
import argparse
import struct
from typing import List, Dict, Optional, Tuple
from pathlib import Path

try:
    from capstone import Cs, CS_ARCH_ARM64, CS_ARCH_ARM, CS_MODE_ARM, CS_MODE_LITTLE_ENDIAN
    CAPSTONE_AVAILABLE = True
except ImportError:
    CAPSTONE_AVAILABLE = False

try:
    import ropgadget
    ROPGADGET_AVAILABLE = True
except ImportError:
    ROPGADGET_AVAILABLE = False


class Gadget:
    """Represents a ROP gadget."""

    def __init__(self, address: int, instructions: List[str], raw_bytes: bytes):
        self.address = address
        self.instructions = instructions
        self.raw_bytes = raw_bytes
        self.disassembly = "; ".join(instructions)

    def __str__(self):
        return f"0x{self.address:08x}: {self.disassembly}"


class ROPHelper:
    """Main ROP gadget finder class."""

    # Common ROP gadgets to search for (ARM64)
    ARM64_PATTERNS = {
        "pop_x0": ["pop {x0}", "ret"],
        "pop_x1": ["pop {x1}", "ret"],
        "pop_x0_x1": ["pop {x0, x1}", "ret"],
        "pop_x0_x1_x2": ["pop {x0, x1, x2}", "ret"],
        "pop_x0_lr": ["pop {x0, lr}", "b lr"],
        "pop_x19_x20": ["pop {x19, x20}", "ret"],
        "pop_x19_x20_x21": ["pop {x19, x20, x21}", "ret"],
        "ldr_x0_sp": ["ldr x0, [sp]", "ret"],
        "ldr_x1_sp": ["ldr x1, [sp]", "ret"],
        "add_sp_sp": ["add sp, sp, #0x10", "ret"],
        "mov_x0_x19": ["mov x0, x19", "ret"],
        "mov_x1_x20": ["mov x1, x20", "ret"],
        "blr_x19": ["blr x19"],
        "br_x19": ["br x19"],
    }

    # Common ROP gadgets to search for (ARM)
    ARM_PATTERNS = {
        "pop_r0": ["pop {r0}", "bx lr"],
        "pop_r0_r1": ["pop {r0, r1}", "bx lr"],
        "pop_r4": ["pop {r4}", "bx lr"],
        "pop_r4_pc": ["pop {r4, pc}"],
        "ldr_r0_sp": ["ldr r0, [sp]", "bx lr"],
        "mov_r0_r4": ["mov r0, r4", "bx lr"],
        "blx_r4": ["blx r4"],
        "bx_r4": ["bx r4"],
    }

    def __init__(self, library_path: str, arch: str):
        self.library_path = library_path
        self.arch = arch
        self.gadgets: List[Gadget] = []
        self.base_address = 0

        # Validate architecture
        if arch.lower() not in ["arm", "arm64", "armv7", "aarch64"]:
            raise ValueError(f"Unsupported architecture: {arch}")

        # Map to Capstone architecture
        if arch.lower() in ["arm64", "aarch64"]:
            self.cs_arch = CS_ARCH_ARM64
            self.cs_mode = CS_MODE_ARM
            self.patterns = self.ARM64_PATTERNS
        else:
            self.cs_arch = CS_ARCH_ARM
            self.cs_mode = CS_MODE_ARM
            self.patterns = self.ARM_PATTERNS

        # Initialize Capstone
        if CAPSTONE_AVAILABLE:
            self.cs = Cs(self.cs_arch, self.cs_mode)
            self.cs.detail = True
        else:
            self.cs = None

    def _read_library(self) -> bytes:
        """Read the library file."""
        try:
            with open(self.library_path, "rb") as f:
                return f.read()
        except IOError as e:
            raise RuntimeError(f"Failed to read library: {e}")

    def _find_executable_sections(self, data: bytes) -> List[Tuple[int, int]]:
        """
        Find executable sections in the library.

        This is a simplified implementation. For production use,
        you should parse ELF headers properly.
        """
        sections = []

        # Simple heuristic: scan for executable segments
        # In production, use pefile or elftools for proper parsing
        section_start = 0
        section_end = len(data)

        # For ARM/ARM64, executable code usually starts after headers
        # This is a simplified approach - real implementation should parse ELF
        if data[:4] == b'\x7fELF':  # ELF file
            # Simple approach: assume executable sections after first 0x1000 bytes
            section_start = 0x1000
            section_end = min(section_start + 0x100000, len(data))  # First 1MB
        else:
            # Try to detect by looking for common ARM instructions
            # This is very basic
            for i in range(0, min(0x1000, len(data)), 4):
                if data[i:i+4] == b'\x00\x00\x1f\xd6' or data[i:i+4] == b'\x00\x00\x00\x00':
                    # Found potential code start
                    section_start = i
                    break

        sections.append((section_start, section_end))
        return sections

    def _find_gadgets_capstone(self, data: bytes, section_start: int, section_end: int, max_instructions: int = 5) -> List[Gadget]:
        """Find gadgets using Capstone."""
        gadgets = []

        if not CAPSTONE_AVAILABLE:
            print("[!] Capstone not available, using simpler pattern matching")
            return self._find_gadgets_simple(data, section_start, section_end)

        # Scan for ret instructions
        for offset in range(section_start, section_end - 4):
            # Check if current instruction is ret
            inst_bytes = data[offset:offset+4]
            
            # Check for ret (ARM64: 0xd65f03c0, ARM: depends on mode)
            is_ret = False
            if self.cs_arch == CS_ARCH_ARM64:
                if inst_bytes == b'\xc0\x03\x5f\xd6':  # ret
                    is_ret = True
            else:  # ARM
                if inst_bytes[3] & 0x0f == 0x0f:  # bx lr or similar
                    is_ret = True

            if is_ret:
                # Trace backwards to find gadget
                gad_insts = []
                gad_bytes = b""
                current_offset = offset

                # Trace backwards up to max_instructions
                for _ in range(max_instructions):
                    current_offset -= 4
                    if current_offset < section_start:
                        break

                    # Disassemble instruction
                    for inst in self.cs.disasm(data[current_offset:offset+4], current_offset):
                        # Stop if we hit a branch or call
                        if "b " in inst.mnemonic.lower() or "bl " in inst.mnemonic.lower():
                            gad_insts.insert(0, (inst.address, inst))
                            gad_bytes = data[current_offset:offset+4] + gad_bytes
                            break

                        gad_insts.insert(0, (inst.address, inst))
                        gad_bytes = data[current_offset:offset+4] + gad_bytes
                        break
                    else:
                        # Could not disassemble
                        break

                # Create gadget
                if gad_insts:
                    inst_strs = [f"{inst.mnemonic} {inst.op_str}" for addr, inst in gad_insts]
                    gadget = Gadget(
                        address=current_offset,
                        instructions=inst_strs,
                        raw_bytes=gad_bytes
                    )
                    gadgets.append(gadget)

        return gadgets

    def _find_gadgets_simple(self, data: bytes, section_start: int, section_end: int) -> List[Gadget]:
        """Find gadgets using simple pattern matching (no Capstone)."""
        gadgets = []

        # Search for common patterns in our patterns dict
        for pattern_name, pattern_insts in self.patterns.items():
            # This is simplified - in reality, you'd need to convert
            # instructions to bytes and search for them
            # For now, just note that this requires Capstone
            pass

        print("[!] Simple pattern matching requires manual implementation")
        print("[!] Install Capstone for better results: pip install capstone")

        return gadgets

    def find_gadgets(self, max_instructions: int = 5) -> List[Gadget]:
        """Find all ROP gadgets in the library."""
        data = self._read_library()
        sections = self._find_executable_sections(data)

        print(f"[*] Found {len(sections)} executable section(s)")

        all_gadgets = []
        for section_start, section_end in sections:
            print(f"[*] Scanning section 0x{section_start:x} - 0x{section_end:x}")
            gadgets = self._find_gadgets_capstone(data, section_start, section_end, max_instructions)
            all_gadgets.extend(gadgets)

        self.gadgets = all_gadgets
        print(f"[*] Found {len(all_gadgets)} gadgets")

        return all_gadgets

    def filter_gadgets(self, pattern: str) -> List[Gadget]:
        """Filter gadgets by pattern."""
        pattern = pattern.lower()
        return [g for g in self.gadgets if pattern in g.disassembly.lower()]

    def find_common_gadgets(self) -> Dict[str, Gadget]:
        """Find common ROP gadgets."""
        common_gadgets = {}

        if not self.gadgets:
            self.find_gadgets()

        # Search for patterns
        for pattern_name, pattern_insts in self.patterns.items():
            for gadget in self.gadgets:
                # Check if gadget contains all instructions in pattern
                gadget_lower = gadget.disassembly.lower()
                pattern_found = all(inst.lower() in gadget_lower for inst in pattern_insts)

                if pattern_found:
                    common_gadgets[pattern_name] = gadget
                    break  # Use first match

        return common_gadgets

    def print_gadgets(self, gadgets: List[Gadget], limit: int = 20):
        """Print gadgets in a formatted way."""
        print(f"\n[*] Found {len(gadgets)} gadgets")
        print("=" * 80)

        for i, gadget in enumerate(gadgets[:limit]):
            print(f"{i+1}. {gadget}")
            # Print hex dump
            hex_str = " ".join(f"{b:02x}" for b in gadget.raw_bytes)
            print(f"   Bytes: {hex_str}")
            print()

        if len(gadgets) > limit:
            print(f"... and {len(gadgets) - limit} more gadgets")
            print(f"[*] Use --output to save all gadgets to file")

    def save_gadgets(self, gadgets: List[Gadget], output_path: str):
        """Save gadgets to a file."""
        with open(output_path, "w") as f:
            f.write(f"# ROP Gadgets from {self.library_path}\n")
            f.write(f"# Architecture: {self.arch}\n")
            f.write(f"# Base address: 0x{self.base_address:08x}\n")
            f.write(f"# Total gadgets: {len(gadgets)}\n")
            f.write("\n")

            for gadget in gadgets:
                f.write(f"0x{gadget.address:08x}: {gadget.disassembly}\n")
                f.write(f"# Bytes: {' '.join(f'{b:02x}' for b in gadget.raw_bytes)}\n")
                f.write("\n")

        print(f"[+] Saved {len(gadgets)} gadgets to {output_path}")

    def use_ropgadget(self, args: List[str] = None) -> str:
        """Use ROPgadget tool if available."""
        if not ROPGADGET_AVAILABLE:
            print("[!] ROPgadget not available")
            print("[!] Install with: pip install ropgadget")
            return ""

        cmd = ["ropgadget", "--binary", self.library_path]
        if args:
            cmd.extend(args)

        import subprocess
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            return result.stdout
        except (subprocess.TimeoutExpired, OSError) as e:
            print(f"[!] Failed to run ROPgadget: {e}")
            return ""


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="ROP Chain Helper for Android Pentesting",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Find all gadgets in ARM64 library
  python3 rop-helper.py --library libtarget.so --arch arm64

  # Search for specific gadget pattern
  python3 rop-helper.py --library libtarget.so --arch arm64 --gadget "pop x0"

  # Find common gadgets
  python3 rop-helper.py --library libtarget.so --arch arm64 --common

  # Use ROPgadget tool (if installed)
  python3 rop-helper.py --library libtarget.so --arch arm64 --ropgadget

  # Save gadgets to file
  python3 rop-helper.py --library libtarget.so --arch arm64 --output gadgets.txt

NOTES:
  - This is a reference implementation for educational purposes
  - For production use, consider using dedicated ROP gadget tools
  - Always obtain proper authorization before testing
        """
    )

    parser.add_argument(
        "--library",
        "-l",
        required=True,
        help="Path to native library (.so file)"
    )

    parser.add_argument(
        "--arch",
        "-a",
        required=True,
        choices=["arm", "arm64", "armv7", "aarch64"],
        help="Architecture of the library"
    )

    parser.add_argument(
        "--gadget",
        "-g",
        help="Search for specific gadget pattern"
    )

    parser.add_argument(
        "--common",
        "-c",
        action="store_true",
        help="Find common ROP gadgets"
    )

    parser.add_argument(
        "--max-instructions",
        "-m",
        type=int,
        default=5,
        help="Maximum instructions per gadget (default: 5)"
    )

    parser.add_argument(
        "--output",
        "-o",
        help="Output file for gadgets"
    )

    parser.add_argument(
        "--ropgadget",
        "-r",
        action="store_true",
        help="Use ROPgadget tool instead of built-in finder"
    )

    parser.add_argument(
        "--ropgadget-args",
        nargs=argparse.REMAINDER,
        help="Additional arguments for ROPgadget"
    )

    args = parser.parse_args()

    # Check if library exists
    if not os.path.exists(args.library):
        print(f"[-] Library not found: {args.library}")
        return 1

    # Create ROP helper
    try:
        helper = ROPHelper(args.library, args.arch)
    except ValueError as e:
        print(f"[-] Error: {e}")
        return 1

    # Use ROPgadget if requested
    if args.ropgadget:
        print("[*] Using ROPgadget tool")
        output = helper.use_ropgadget(args.ropgadget_args)
        if output:
            if args.output:
                with open(args.output, "w") as f:
                    f.write(output)
                print(f"[+] Saved ROPgadget output to {args.output}")
            else:
                print(output)
            return 0
        else:
            return 1

    # Find gadgets
    print(f"[*] Analyzing library: {args.library}")
    print(f"[*] Architecture: {args.arch}")
    print(f"[*] Max instructions: {args.max_instructions}")
    print()

    gadgets = helper.find_gadgets(args.max_instructions)

    if not gadgets:
        print("[-] No gadgets found")
        return 1

    # Filter by pattern if specified
    if args.gadget:
        gadgets = helper.filter_gadgets(args.gadget)
        print(f"[*] Filtered to {len(gadgets)} gadgets matching '{args.gadget}'")
        print()

    # Find common gadgets if requested
    if args.common:
        common = helper.find_common_gadgets()
        print("\n[*] Common ROP Gadgets:")
        print("=" * 80)
        for name, gadget in common.items():
            print(f"{name}: {gadget}")
        print()

    # Print gadgets
    helper.print_gadgets(gadgets)

    # Save to file if requested
    if args.output:
        helper.save_gadgets(gadgets, args.output)

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n[!] Interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"[-] Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
