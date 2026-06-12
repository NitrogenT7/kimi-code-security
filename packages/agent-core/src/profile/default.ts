import agentYaml from './default/agent.yaml?raw';
import androidReverserYaml from './default/android-reverser.yaml?raw';
import binaryReverserYaml from './default/binary-reverser.yaml?raw';
import codeAuditorYaml from './default/code-auditor.yaml?raw';
import coderYaml from './default/coder.yaml?raw';
import exploreYaml from './default/explore.yaml?raw';
import initMd from './default/init.md?raw';
import planYaml from './default/plan.yaml?raw';
import securityAnalystYaml from './default/security-analyst.yaml?raw';
import systemMd from './default/system.md?raw';
import webPentesterYaml from './default/web-pentester.yaml?raw';
import { loadAgentProfilesFromSources } from './load';

// Keyed by the source path the profile loader expects: profile YAML files
// plus any file referenced through `systemPromptPath`.
const PROFILE_SOURCES: Record<string, string> = {
  'profile/default/agent.yaml': agentYaml,
  'profile/default/android-reverser.yaml': androidReverserYaml,
  'profile/default/binary-reverser.yaml': binaryReverserYaml,
  'profile/default/code-auditor.yaml': codeAuditorYaml,
  'profile/default/coder.yaml': coderYaml,
  'profile/default/explore.yaml': exploreYaml,
  'profile/default/plan.yaml': planYaml,
  'profile/default/security-analyst.yaml': securityAnalystYaml,
  'profile/default/system.md': systemMd,
  'profile/default/web-pentester.yaml': webPentesterYaml,
};

export const DEFAULT_INIT_PROMPT = initMd;

export const DEFAULT_AGENT_PROFILES = loadAgentProfilesFromSources(
  [
    'agent.yaml',
    'android-reverser.yaml',
    'binary-reverser.yaml',
    'code-auditor.yaml',
    'coder.yaml',
    'explore.yaml',
    'plan.yaml',
    'security-analyst.yaml',
    'web-pentester.yaml',
  ].map((file) => `profile/default/${file}`),
  PROFILE_SOURCES,
);
