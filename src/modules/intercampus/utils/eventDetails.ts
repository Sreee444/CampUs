const cleanLines = (lines: string[]) => lines.map((line) => line.trim()).filter(Boolean);

export const buildInterCampusDetailsDescription = (baseDescription: string, detailLines: string[]) => {
  const cleaned = cleanLines(detailLines);
  if (!cleaned.length) return baseDescription.trim();
  const suffix = `\n\nInterCampus Details:\n${cleaned.join('\n')}`;
  return `${baseDescription || ''}${suffix}`.trim();
};

