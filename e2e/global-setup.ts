import { existsSync, rmSync } from 'node:fs';

export default function globalSetup(): void {
  if (existsSync('.tmp')) rmSync('.tmp', { recursive: true, force: true });
}
