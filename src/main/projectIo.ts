import { promises as fs } from 'node:fs';
import { AppError } from '@shared/errors';
import type { OpenedProject, ProjectData } from '@shared/types';
import { MAX_PROJECT_BYTES, parseProject, serializeProject } from '@backend/project';
import { writeFileAtomic } from './fsUtil';

export { PROJECT_EXTENSION } from '@backend/project';

export async function writeProjectFile(path: string, project: ProjectData): Promise<void> {
  try {
    await writeFileAtomic(path, serializeProject(project));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('file_io', `Could not save the project: ${(e as Error).message}`, { hint: 'Check that the folder exists and is writable.' });
  }
}

export async function readProjectFile(path: string): Promise<OpenedProject> {
  let stat;
  try {
    stat = await fs.stat(path);
  } catch (e) {
    throw new AppError('file_io', `Could not open ${path}: ${(e as Error).message}`);
  }
  if (stat.size > MAX_PROJECT_BYTES) throw new AppError('corrupted_project', `Project file is too large (${Math.round(stat.size / 1e6)} MB).`);
  const text = await fs.readFile(path, 'utf8');
  const { project, warnings } = parseProject(text);
  return { project, path, warnings };
}
