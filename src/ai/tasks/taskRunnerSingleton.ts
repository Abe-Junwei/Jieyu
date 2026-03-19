import { TaskRunner } from './TaskRunner';

const globalTaskRunner = new TaskRunner(1);

export function getGlobalTaskRunner(): TaskRunner {
  return globalTaskRunner;
}
