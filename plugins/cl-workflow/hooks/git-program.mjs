import { statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

// git from an absolute folder of PATH, never by its bare name: Windows looks in the working folder, a project, first.
export const gitProgram = () =>
  (process.env.PATH ?? '')
    .split(delimiter)
    .filter((folder) => isAbsolute(folder))
    .map((folder) => join(folder, process.platform === 'win32' ? 'git.exe' : 'git'))
    .find((path) => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    });
