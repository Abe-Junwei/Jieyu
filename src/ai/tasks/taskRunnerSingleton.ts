import { TaskRunner } from './TaskRunner';

let globalTaskRunner: TaskRunner | undefined;

export function getGlobalTaskRunner(): TaskRunner {
  globalTaskRunner ??= new TaskRunner(1);
  return globalTaskRunner;
}
