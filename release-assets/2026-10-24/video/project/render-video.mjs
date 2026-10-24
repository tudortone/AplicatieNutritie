import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
/** @param {string[]} files @param {number[]} seconds @param {string} output */
export function buildArguments(files, seconds, output) {
  if (files.length !== 6 || seconds.length !== 6 || seconds.some(n => !Number.isFinite(n) || n <= 0)) throw new Error('INVALID_TIMELINE');
  const inputs = files.flatMap((file, i) => [...(i === 5 ? ['-loop', '1'] : []), '-i', file]);
  const filters = seconds.map((n, i) => `[${i}:v]trim=duration=${n},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x090C0E,setsar=1,fps=30,format=yuv420p[v${i}]`);
  filters.push('[v0][v1][v2][v3][v4][v5]concat=n=6:v=1:a=0[outv]');
  return ['-n', ...inputs, '-filter_complex', filters.join(';'), '-map', '[outv]', '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', output];
}
/** @param {string} captureRoot @param {string} output */
export function prepare(captureRoot, output) {
  const timeline = JSON.parse(fs.readFileSync(path.join(here, 'timeline.json'), 'utf8'));
  const files = timeline.shots.map((shot, i) => path.resolve(i === 5 ? here : captureRoot, shot.file));
  if (files.some(file => !fs.existsSync(file))) throw new Error('AUTHENTIC_MEDIA_MISSING_NO_EXPORT');
  if (fs.existsSync(output)) throw new Error('OUTPUT_EXISTS_NO_OVERWRITE');
  return buildArguments(files, timeline.shots.map(shot => shot.duration), output);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv.includes('--approved-sanitized')) throw new Error('OWNER_MEDIA_APPROVAL_REQUIRED');
    const args = prepare(process.argv[2], path.resolve(process.argv[3]));
    const result = spawnSync('ffmpeg', args, { shell: false, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('FFMPEG_EXPORT_FAILED_OR_UNAVAILABLE');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
