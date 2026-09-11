import { assign, fromCallback, setup, type Snapshot } from 'xstate';

import { createDecorator, IInstantiationService } from '#/_base/di/instantiation';
import { Emitter, type Event } from '#/_base/event';
import { registerEvent2Class } from '#/app/event/event2';
import {
  AgentActorService,
  type AgentActorContext,
  type AgentActorRestoreEvent,
} from '#/agent/actorService/agentActorService';
import { IAgentContextMemoryService } from '#/agent/contextMemory/contextMemory';
import { IAgentScopeContext } from '#/agent/scopeContext/scopeContext';
import { IAgentToolPolicyService } from '#/agent/toolPolicy/toolPolicy';
import { IAgentReminderService } from '#/features/reminder/reminderService';
import { MAIN_AGENT_ID } from '#/session/agentLifecycle/agentLifecycle';
import { IEventDispatcher } from '#/state/eventDispatcher';

import {
  FINDINGS_STORE_KEY,
  mergeArchivedFindings,
  readFindingItems,
  type FindingItem,
} from './findings';
import { TODO_STORE_KEY, readTodoItems, type TodoItem } from './todoItem';
import { TODO_LIST_TOOL_NAME } from './todoItem';
import { TODO_LIST_REMINDER_VARIANT, todoListStaleReminder } from './todoListReminder';
import { ToolsUpdateStore } from './todoOps';

import '#/agent/contextMemory/conversationTime';

registerEvent2Class(ToolsUpdateStore);

export interface TodoDurableState {
  readonly todos: readonly TodoItem[];
  readonly findings: readonly FindingItem[];
}

interface TodoActorContext {
  readonly todos: readonly TodoItem[];
  readonly findings: readonly FindingItem[];
  readonly runtime: AgentActorContext<TodoDurableState>;
  readonly used: boolean;
}

interface TodoCommitEvent {
  readonly type: 'todo.commit';
  readonly todos: readonly TodoItem[];
  readonly findings: readonly FindingItem[];
}

interface TodoUsedEvent {
  readonly type: 'todo.used';
}

type TodoActorSnapshot = Snapshot<unknown> & { readonly context: TodoActorContext };

const todoReminder = fromCallback(({
  input,
}: {
  input: {
    readonly runtime: AgentActorContext<TodoDurableState>;
  };
}) => {
  if (input.runtime.agent.agentId !== MAIN_AGENT_ID) return;
  const injector = input.runtime.get(IAgentReminderService);
  const memory = input.runtime.get(IAgentContextMemoryService);
  const toolPolicy = input.runtime.get(IAgentToolPolicyService);
  const registration = injector.register(TODO_LIST_REMINDER_VARIANT, () =>
    todoListStaleReminder({
      active: toolPolicy.isToolActive(TODO_LIST_TOOL_NAME, 'builtin'),
      history: memory.get(),
      todos: input.runtime.getState().todos,
    }),
  );
  return () => { registration.dispose(); };
});

const todoActorLogic = setup({
  types: {} as {
    context: TodoActorContext;
    input: AgentActorContext<TodoDurableState>;
    events: TodoCommitEvent | TodoUsedEvent | AgentActorRestoreEvent;
  },
  actors: { todoReminder },
}).createMachine({
  context: ({ input }) => ({ todos: [], findings: [], runtime: input, used: false }),
  initial: 'beforeRestore',
  states: {
    beforeRestore: {
      on: {
        'runtime.restore': [
          { target: 'reminding', guard: ({ context }) => context.used },
          { target: 'active' },
        ],
        'todo.used': { actions: assign({ used: true }) },
      },
    },
    active: {
      on: {
        'todo.used': { target: 'reminding', actions: assign({ used: true }) },
      },
    },
    reminding: {
      invoke: {
        src: 'todoReminder',
        input: ({ context }) => ({ runtime: context.runtime }),
      },
    },
  },
  on: {
    'todo.commit': {
      actions: assign({
        todos: ({ event }) => event.todos,
        findings: ({ event }) => event.findings,
      }),
    },
  },
});

export interface IAgentTodoService {
  readonly _serviceBrand: undefined;
  readonly onDidChange: Event<readonly TodoItem[]>;
  get(): readonly TodoItem[];
  getFindings(): readonly FindingItem[];
  replace(todos: readonly TodoItem[]): Promise<void>;
  clear(): Promise<void>;
}

export const IAgentTodoService = createDecorator<IAgentTodoService>('agentTodoService');

export class AgentTodoService extends AgentActorService<TodoDurableState> implements IAgentTodoService {
  declare readonly _serviceBrand: undefined;
  readonly onDidChange: IAgentTodoService['onDidChange'];

  private readonly actor: AgentActorContext<TodoDurableState>;
  private readonly onDidChangeEmitter = new Emitter<readonly TodoItem[]>();

  constructor(
    @IEventDispatcher dispatcher: IEventDispatcher,
    @IAgentScopeContext scopeContext: IAgentScopeContext,
    @IInstantiationService instantiation: IInstantiationService,
  ) {
    super(dispatcher, scopeContext, instantiation);
    this.onDidChange = this.onDidChangeEmitter.event;
    let lastRead: TodoDurableState | undefined;
    this.actor = this.attachActor(todoActorLogic, {
      id: 'todo',
      durable: {
        events: [ToolsUpdateStore],
        undoable: true,
        transition: (state, event) => {
          if (!(event instanceof ToolsUpdateStore)) return;
          if (event.key === TODO_STORE_KEY) {
            return { todos: readTodoItems(event.value), findings: state.findings };
          }
          if (event.key === FINDINGS_STORE_KEY) {
            return { todos: state.todos, findings: readFindingItems(event.value) };
          }
          return;
        },
        read: (snapshot) => {
          const context = (snapshot as TodoActorSnapshot).context;
          if (
            lastRead !== undefined &&
            lastRead.todos === context.todos &&
            lastRead.findings === context.findings
          ) {
            return lastRead;
          }
          lastRead = { todos: context.todos, findings: context.findings };
          return lastRead;
        },
        commit: (actor, state) => {
          actor.send({ type: 'todo.commit', todos: state.todos, findings: state.findings });
        },
      },
    });
    let previousTodos: readonly TodoItem[] | undefined;
    this._register(
      this.actor.onDidChange((state) => {
        if (previousTodos === state.todos) return;
        previousTodos = state.todos;
        this.onDidChangeEmitter.fire(state.todos);
      }),
    );
  }

  get(): readonly TodoItem[] {
    this.actor.send({ type: 'todo.used' });
    return this.actor.getState().todos;
  }

  getFindings(): readonly FindingItem[] {
    return this.actor.getState().findings;
  }

  async replace(todos: readonly TodoItem[]): Promise<void> {
    this.actor.send({ type: 'todo.used' });
    const next: readonly TodoItem[] = todos.map((todo) => ({ ...todo }));
    const findings = mergeArchivedFindings(
      this.actor.getState().todos,
      next,
      this.actor.getState().findings,
    );
    if (findings !== undefined) {
      await this.actor.dispatch(new ToolsUpdateStore({
        agentId: this.actor.agent.agentId,
        key: FINDINGS_STORE_KEY,
        value: findings,
      }));
    }
    return this.actor.dispatch(new ToolsUpdateStore({
      agentId: this.actor.agent.agentId,
      key: TODO_STORE_KEY,
      value: next,
    }));
  }

  clear(): Promise<void> {
    return this.replace([]);
  }
}
