/**
 * 从 `<input type="file">` 读取音视频文件并解析时长（元数据 only）。
 */
export async function readMediaFileFromInput(
  event: React.ChangeEvent<HTMLInputElement>,
): Promise<{ file: File; duration: number } | null> {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return null;

  const isAudio = file.type.startsWith('audio/');
  const isVideo = file.type.startsWith('video/');
  if (!isAudio && !isVideo) {
    input.value = '';
    return null;
  }

  const media = document.createElement(isVideo ? 'video' : 'audio') as HTMLMediaElement;
  media.preload = 'metadata';
  const objectUrl = URL.createObjectURL(file);
  media.src = objectUrl;
  const duration = await new Promise<number>((resolve) => {
    media.addEventListener(
      'loadedmetadata',
      () => {
        URL.revokeObjectURL(objectUrl);
        resolve(Number.isFinite(media.duration) ? media.duration : 0);
      },
      { once: true },
    );
    media.addEventListener(
      'error',
      () => {
        URL.revokeObjectURL(objectUrl);
        resolve(0);
      },
      { once: true },
    );
  });

  input.value = '';
  if (!(duration > 0)) return null;
  return { file, duration };
}
