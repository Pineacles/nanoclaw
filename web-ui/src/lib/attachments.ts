export interface ParsedAttachment {
  type: 'image' | 'file';
  filename: string;
  displayName: string;
  url: string;
}

const IMAGE_REGEX = /\n?\[Image: (?:\/workspace\/group\/uploads\/|uploads\/)([^\]]+)\]/g;
const FILE_REGEX = /\n?\[File: (?:\/workspace\/group\/uploads\/|uploads\/)([^\]]+)\]/g;

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']);

function getExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function toDisplayName(filename: string): string {
  const match = filename.match(/^\d+_[a-f0-9-]+_(.+)$/);
  if (match) return match[1];
  return filename;
}

export function parseAttachments(content: string): {
  cleanContent: string;
  attachments: ParsedAttachment[];
} {
  const attachments: ParsedAttachment[] = [];

  let cleanContent = content.replace(IMAGE_REGEX, (_match, filename: string) => {
    attachments.push({
      type: 'image',
      filename,
      displayName: toDisplayName(filename),
      url: `/uploads/${filename}`,
    });
    return '';
  });

  cleanContent = cleanContent.replace(FILE_REGEX, (_match, filename: string) => {
    const ext = getExt(filename);
    attachments.push({
      type: IMAGE_EXTS.has(ext) ? 'image' : 'file',
      filename,
      displayName: toDisplayName(filename),
      url: `/uploads/${filename}`,
    });
    return '';
  });

  return { cleanContent: cleanContent.trimEnd(), attachments };
}
