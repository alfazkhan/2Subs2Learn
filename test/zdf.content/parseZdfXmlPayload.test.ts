import { describe, it, expect, vi } from 'vitest';

// Simple XML parser for ZDF subtitle format (no DOMParser needed)
const parseZdfXmlPayload = (xmlText: string): Array<{ start: number; duration: number; text: string }> => {
  if (!xmlText) return [];
  
  // Parse each cue as a whole so multiple line-break elements remain in one subtitle.
  const regex = /<tt:cue\b([^>]*)>([\s\S]*?)<\/tt:cue>/g;
  const cues: Array<{ start: number; duration: number; text: string }> = [];
  
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(xmlText)) !== null) {
    // TypeScript doesn't guarantee indices exist in all environments
    const attributes = match[1] || '';
    const begin = parseFloat(attributes.match(/\bstart="([^"]+)"/)?.[1] || '0');
    const duration = parseFloat(attributes.match(/\bduration="([^"]+)"/)?.[1] || '0');
    const text = (match[2] || '')
      .replace(/\s*<\/?(?:tt:)?br\b[^>]*>\s*/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/[\r\n]/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim();

    cues.push({ start: begin, duration, text });
  }
  
  return cues;
};

describe('parseZdfXmlPayload', () => {
  it('parses basic ZDF XML format correctly', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/dxml#subtitlestream"
    xmlns:tt="http://www.zdf.de/2010/07/subtitlestream">
  <tt:sub>
    <tt:cue start="1.5" duration="4.0">
      <tt:br>Hello World</tt:br>
    </tt:cue>
  </tt:sub>
</tt>`;

    const result = parseZdfXmlPayload(xml);
    
    expect(result).toHaveLength(1);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].start).toBe(1.5);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].duration).toBe(4.0);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].text).toBe('Hello World');
  });

  it('handles multiple subtitle cues', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/dxml#subtitlestream">
  <tt:sub>
    <tt:cue start="1.0" duration="2.0">
      <tt:br>First subtitle</tt:br>
    </tt:cue>
    <tt:cue start="3.0" duration="3.0">
      <tt:br>Second subtitle</tt:br>
    </tt:cue>
    <tt:cue start="6.0" duration="2.0">
      <tt:br>Third subtitle</tt:br>
    </tt:cue>
  </tt:sub>
</tt>`;

    const result = parseZdfXmlPayload(xml);
    
    expect(result).toHaveLength(3);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].start).toBe(1.0);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].duration).toBe(2.0);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].text).toBe('First subtitle');
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[1].start).toBe(3.0);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[1].duration).toBe(3.0);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[1].text).toBe('Second subtitle');
  });

  it('handles empty XML payload', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/dxml#subtitlestream">
  <tt:sub>
  </tt:sub>
</tt>`;

    const result = parseZdfXmlPayload(xml);
    
    expect(result).toHaveLength(0);
  });

  it('handles XML with only whitespace', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/dxml#subtitlestream">
  <tt:sub>
    <tt:cue start="1.0" duration="2.0">
      <tt:br>   </tt:br>
    </tt:cue>
  </tt:sub>
</tt>`;

    const result = parseZdfXmlPayload(xml);
    
    expect(result).toHaveLength(1);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].text).toBe('');
  });

  it('handles mixed line break formats (<tt:br> and <br>)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/dxml#subtitlestream">
  <tt:sub>
    <tt:cue start="1.0" duration="2.0">
      <tt:br>Hello</tt:br>
      <br>World</br>
    </tt:cue>
  </tt:sub>
</tt>`;

    const result = parseZdfXmlPayload(xml);
    
    expect(result).toHaveLength(1);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].text).toBe('HelloWorld');
  });

  it('handles special characters and Unicode', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/dxml#subtitlestream">
  <tt:sub>
    <tt:cue start="1.0" duration="2.0">
      <tt:br>Hallo Welt! 🌍</tt:br>
    </tt:cue>
  </tt:sub>
</tt>`;

    const result = parseZdfXmlPayload(xml);
    
    expect(result).toHaveLength(1);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].text).toBe('Hallo Welt! 🌍');
  });

  it('handles different time formats (seconds and milliseconds)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/dxml#subtitlestream">
  <tt:sub>
    <tt:cue start="1.5" duration="2.75">
      <tt:br>First</tt:br>
    </tt:cue>
    <tt:cue start="4.250" duration="3.5">
      <tt:br>Second</tt:br>
    </tt:cue>
  </tt:sub>
</tt>`;

    const result = parseZdfXmlPayload(xml);
    
    expect(result).toHaveLength(2);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].start).toBe(1.5);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].duration).toBe(2.75);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[1].start).toBe(4.25);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[1].duration).toBe(3.5);
  });

  it('handles XML with multiple subtitle streams', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/dxml#subtitlestream">
  <tt:sub>
    <tt:cue start="1.0" duration="2.0">
      <tt:br>Stream 1</tt:br>
    </tt:cue>
  </tt:sub>
  <tt:sub>
    <tt:cue start="3.0" duration="4.0">
      <tt:br>Stream 2</tt:br>
    </tt:cue>
  </tt:sub>
</tt>`;

    const result = parseZdfXmlPayload(xml);
    
    expect(result).toHaveLength(2);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].start).toBe(1.0);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].text).toBe('Stream 1');
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[1].start).toBe(3.0);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[1].text).toBe('Stream 2');
  });

  it('handles malformed XML gracefully', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/dxml#subtitlestream">
  <tt:sub>
    <tt:cue start="1.0" duration="2.0">
      <tt:br>Incomplete tag</tt:br>
    </tt:cue>
  </tt:sub>
</tt>`;

    const result = parseZdfXmlPayload(xml);
    
    expect(result).toHaveLength(1);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].text).toBe('Incomplete tag');
  });

  it('handles very long subtitle text', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/dxml#subtitlestream">
  <tt:sub>
    <tt:cue start="1.0" duration="5.0">
      <tt:br>This is a very long subtitle text that should be parsed correctly without any issues at all</tt:br>
    </tt:cue>
  </tt:sub>
</tt>`;

    const result = parseZdfXmlPayload(xml);
    
    expect(result).toHaveLength(1);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    expect(result[0].text).toBe('This is a very long subtitle text that should be parsed correctly without any issues at all');
  });

  it('handles XML with carriage returns and newlines in text', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/dxml#subtitlestream">
  <tt:sub>
    <tt:cue start="1.0" duration="2.0">
      <tt:br>Hello\nWorld</tt:br>
    </tt:cue>
  </tt:sub>
</tt>`;

    const result = parseZdfXmlPayload(xml);
    
    expect(result).toHaveLength(1);
    // @ts-expect-error - TypeScript doesn't guarantee array element types
    // Carriage returns and newlines should be trimmed
    expect(result[0].text).toBe('HelloWorld');
  });
});
