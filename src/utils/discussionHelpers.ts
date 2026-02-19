// Extract clean discussion title by removing event ID and discussion type prefixes
// Input format: "[Pre-Event] [event-123] Actual Title" or "[Post-Event] [event-456] My Discussion"
// Output: "Actual Title" or "My Discussion"
export const getCleanDiscussionTitle = (title?: string): string => {
  if (!title) return '';
  
  // Remove [Pre-Event]/[Post-Event] prefix and [event-XXX] event ID, keeping only the actual title
  const cleanTitle = title
    .replace(/^\[Pre-Event\]\s*/, '')
    .replace(/^\[Post-Event\]\s*/, '')
    .replace(/^\[event-[^\]]+\]\s*/, '');
  
  return cleanTitle;
};

// Check if a discussion is a pre-event discussion
export const isPreEventDiscussion = (title?: string): boolean => {
  return title?.includes('[Pre-Event]') ?? false;
};

// Check if a discussion is a post-event discussion
export const isPostEventDiscussion = (title?: string): boolean => {
  return title?.includes('[Post-Event]') ?? false;
};

// Extract event ID from discussion title
export const getEventIdFromTitle = (title?: string): string | null => {
  if (!title) return null;
  
  const match = title.match(/\[event-([^\]]+)\]/);
  return match ? match[1] : null;
};
