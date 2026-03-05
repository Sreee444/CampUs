export type AttachmentType = 'image' | 'pdf' | 'doc' | 'ppt' | 'file';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

const getExtension = (url: string) => {
  const withoutQuery = (url || '').split('?')[0].split('#')[0];
  const ext = withoutQuery.split('.').pop()?.toLowerCase() || '';
  return ext;
};

export const getFileType = (url: string): AttachmentType => {
  const ext = getExtension(url);

  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'doc' || ext === 'docx') return 'doc';
  if (ext === 'ppt' || ext === 'pptx') return 'ppt';

  return 'file';
};

export const getFileNameFromUrl = (url: string) => {
  const withoutQuery = (url || '').split('?')[0].split('#')[0];
  const fileName = withoutQuery.split('/').pop() || 'attachment';
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
};
