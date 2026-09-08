import { createDecorator } from '#/_base/di/instantiation';
import type { Event } from '#/_base/event';

export interface ISessionNotepadService {
  readonly _serviceBrand: undefined;

  getContent(): string;
  setContent(content: string): void;
  append(text: string): void;
  clear(): void;
  readonly onDidChange: Event<string>;
}

export const ISessionNotepadService = createDecorator<ISessionNotepadService>(
  'sessionNotepadService',
);
