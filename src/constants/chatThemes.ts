export const CHAT_THEME_KEY = 'chat_color_theme';

export type ChatTheme = {
  key: string;
  label: string;
  bubbleColor: string;
  textColor: string;
  timeColor: string;
  incomingBubbleColor: string;
  incomingTextColor: string;
  incomingTimeColor: string;
  incomingBorderColor: string;
};

/**
 * WhatsApp-contrast chat themes.
 * Sent bubbles use slightly darker/muted theme-accent colours for readability over
 * background images.  Incoming bubbles use a dark neutral (#202C33-style) so text
 * pops regardless of background.
 */
export const CHAT_THEMES: ChatTheme[] = [
  {
    key: 'default',
    label: 'Teal',
    bubbleColor: '#005C4B',
    textColor: '#E9EDEF',
    timeColor: 'rgba(233,237,239,0.65)',
    incomingBubbleColor: '#202C33',
    incomingTextColor: '#E9EDEF',
    incomingTimeColor: 'rgba(233,237,239,0.55)',
    incomingBorderColor: 'transparent',
  },
  {
    key: 'blue',
    label: 'Blue',
    bubbleColor: '#1D4ED8',
    textColor: '#E9EDEF',
    timeColor: 'rgba(233,237,239,0.65)',
    incomingBubbleColor: '#202C33',
    incomingTextColor: '#E9EDEF',
    incomingTimeColor: 'rgba(233,237,239,0.55)',
    incomingBorderColor: 'transparent',
  },
  {
    key: 'purple',
    label: 'Purple',
    bubbleColor: '#6D28D9',
    textColor: '#E9EDEF',
    timeColor: 'rgba(233,237,239,0.65)',
    incomingBubbleColor: '#202C33',
    incomingTextColor: '#E9EDEF',
    incomingTimeColor: 'rgba(233,237,239,0.55)',
    incomingBorderColor: 'transparent',
  },
  {
    key: 'green',
    label: 'Green',
    bubbleColor: '#047857',
    textColor: '#E9EDEF',
    timeColor: 'rgba(233,237,239,0.65)',
    incomingBubbleColor: '#202C33',
    incomingTextColor: '#E9EDEF',
    incomingTimeColor: 'rgba(233,237,239,0.55)',
    incomingBorderColor: 'transparent',
  },
  {
    key: 'rose',
    label: 'Rose',
    bubbleColor: '#BE123C',
    textColor: '#E9EDEF',
    timeColor: 'rgba(233,237,239,0.65)',
    incomingBubbleColor: '#202C33',
    incomingTextColor: '#E9EDEF',
    incomingTimeColor: 'rgba(233,237,239,0.55)',
    incomingBorderColor: 'transparent',
  },
  {
    key: 'orange',
    label: 'Orange',
    bubbleColor: '#C2410C',
    textColor: '#E9EDEF',
    timeColor: 'rgba(233,237,239,0.65)',
    incomingBubbleColor: '#202C33',
    incomingTextColor: '#E9EDEF',
    incomingTimeColor: 'rgba(233,237,239,0.55)',
    incomingBorderColor: 'transparent',
  },
  {
    key: 'indigo',
    label: 'Indigo',
    bubbleColor: '#4338CA',
    textColor: '#E9EDEF',
    timeColor: 'rgba(233,237,239,0.65)',
    incomingBubbleColor: '#202C33',
    incomingTextColor: '#E9EDEF',
    incomingTimeColor: 'rgba(233,237,239,0.55)',
    incomingBorderColor: 'transparent',
  },
  {
    key: 'pink',
    label: 'Pink',
    bubbleColor: '#BE185D',
    textColor: '#E9EDEF',
    timeColor: 'rgba(233,237,239,0.65)',
    incomingBubbleColor: '#202C33',
    incomingTextColor: '#E9EDEF',
    incomingTimeColor: 'rgba(233,237,239,0.55)',
    incomingBorderColor: 'transparent',
  },
];

export const withHexAlpha = (hexColor: string, alpha: number): string => {
  const normalized = hexColor.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return hexColor;
  }

  const clampedAlpha = Math.min(1, Math.max(0, alpha));
  const alphaHex = Math.round(clampedAlpha * 255)
    .toString(16)
    .padStart(2, '0');

  return `#${expanded}${alphaHex}`;
};
