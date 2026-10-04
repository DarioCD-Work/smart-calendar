export interface DescriptionPart {
  text: string;
  href?: string;
}

export function safeExternalUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function descriptionText(description: string): string {
  if (typeof DOMParser === 'undefined' || !/<\/?[a-z][^>]*>/i.test(description)) {
    return description;
  }
  const parsed = new DOMParser().parseFromString(description, 'text/html');
  function readNode(node: Node): string {
    if (node.nodeType === 3) {
      return node.textContent ?? '';
    }
    if (node.nodeType !== 1) {
      return '';
    }
    const element = node as Element;
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE'].includes(element.tagName)) {
      return '';
    }
    if (element.tagName === 'BR') {
      return '\n';
    }
    const text = [...element.childNodes].map(readNode).join('');
    if (element.tagName === 'A') {
      const href = safeExternalUrl(element.getAttribute('href') ?? undefined);
      return href && text.trim() !== href ? `${text}\n${href}\n` : text;
    }
    if (['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE'].includes(element.tagName)) {
      return `\n\n${text}\n\n`;
    }
    return text;
  }
  return [...parsed.body.childNodes].map(readNode).join('');
}

function linkLabel(url: string): string {
  const parsed = new URL(url);
  if (parsed.hostname === 'mail.google.com') {
    return 'Abrir en Gmail';
  }
  if ((parsed.hostname === 'g.co' && parsed.pathname.startsWith('/calendar'))
    || parsed.hostname === 'calendar.google.com') {
    return 'Google Calendar';
  }
  return parsed.hostname + (parsed.pathname === '/' ? '' : parsed.pathname.length > 48
    ? `${parsed.pathname.slice(0, 45)}...`
    : parsed.pathname);
}

export function descriptionParagraphs(description: string | undefined): DescriptionPart[][] {
  const text = descriptionText(description ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) {
    return [];
  }
  return text.split(/\n[\t ]*\n+/).filter((paragraph) => paragraph.trim()).map((paragraph) => {
    const parts: DescriptionPart[] = [];
    let offset = 0;
    for (const match of paragraph.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      const index = match.index;
      const rawUrl = match[0];
      let candidate = rawUrl.replace(/[.,;!?:]+$/, '');
      while (candidate.endsWith(')') && (candidate.match(/\)/g)?.length ?? 0) > (candidate.match(/\(/g)?.length ?? 0)) {
        candidate = candidate.slice(0, -1);
      }
      if (index > offset) {
        parts.push({ text: paragraph.slice(offset, index) });
      }
      const href = safeExternalUrl(candidate);
      parts.push(href ? { text: linkLabel(href), href } : { text: candidate });
      offset = index + candidate.length;
    }
    if (offset < paragraph.length) {
      parts.push({ text: paragraph.slice(offset) });
    }
    return parts;
  });
}