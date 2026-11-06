import { describe, expect, test } from 'vitest';

// Uses the real compiled Paraglide messages (pnpm test compiles them first), so
// the templates render exactly as they do in production. Only assertions about
// wording are avoided; the checks below are structural.
import { getTemplate, renderEmailHtml, toPlainText } from '@/mail/render';

describe('toPlainText', () => {
  test('strips tags and collapses whitespace', () => {
    expect(toPlainText('<p>Hello   <b>world</b></p>')).toBe('Hello world');
  });

  test('drops style and script bodies entirely', () => {
    const html =
      '<style>.a{color:red}</style><script>alert("x")</script><p>Body</p>';

    expect(toPlainText(html)).toBe('Body');
  });

  test('removes multi-line style blocks', () => {
    const html = '<style>\n  .a { color: red }\n</style><p>Body</p>';

    expect(toPlainText(html)).toBe('Body');
  });

  test('decodes named entities', () => {
    expect(
      toPlainText('<p>a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;</p>')
    ).toBe('a & b <c> "d" \'e\'');
  });

  test('decodes common typographic entities', () => {
    expect(
      toPlainText('<p>a&nbsp;b &ndash; c&mdash;d &hellip; &copy;</p>')
    ).toBe('a b \u2013 c\u2014d \u2026 \u00a9');
  });

  test('decodes numeric decimal and hex entities', () => {
    expect(toPlainText('<p>&#65;&#x42;&#x1F600;</p>')).toBe('AB\u{1F600}');
  });

  test('leaves unknown entities untouched', () => {
    expect(toPlainText('<p>&unknown;</p>')).toBe('&unknown;');
  });

  test('returns an empty string for empty input', () => {
    expect(toPlainText('')).toBe('');
    expect(toPlainText('<p>   </p>')).toBe('');
  });
});

describe('renderEmailHtml', () => {
  test('renders a React element to an HTML string', async () => {
    const React = await import('react');
    const html = await renderEmailHtml(React.createElement('p', null, 'Hello'));

    expect(html).toContain('Hello');
    expect(html).toContain('<p');
  });

  test('escapes interpolated text', async () => {
    const React = await import('react');
    const html = await renderEmailHtml(
      React.createElement('p', null, '<script>alert(1)</script>')
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('getTemplate', () => {
  test.each([
    ['forgotPassword', { url: 'https://example.test/reset', name: 'Ada' }],
    ['verifyEmail', { url: 'https://example.test/verify', name: 'Ada' }],
    ['subscribeNewsletter', { email: 'ada@example.test' }],
    [
      'contactMessage',
      {
        name: 'Ada',
        email: 'ada@example.test',
        message: 'Please tell me more about the plans.',
      },
    ],
  ] as const)('renders the %s template as html plus a plain-text alternative', async (template, context) => {
    const result = await getTemplate({ template, context });

    expect(result.subject.length).toBeGreaterThan(0);
    expect(result.html).toContain('<html');
    expect(result.text.length).toBeGreaterThan(0);
    // The plain-text part must not carry markup or inline styles.
    expect(result.text).not.toContain('<');
    expect(result.text).not.toContain('style=');
  });

  test('includes the supplied verification URL in the rendered output', async () => {
    const result = await getTemplate({
      template: 'verifyEmail',
      context: { url: 'https://example.test/verify?token=abc', name: 'Ada' },
    });

    expect(result.html).toContain('token=abc');
  });

  test('includes the reset URL in the rendered output', async () => {
    const result = await getTemplate({
      template: 'forgotPassword',
      context: { url: 'https://example.test/reset?token=xyz', name: 'Ada' },
    });

    expect(result.html).toContain('token=xyz');
  });

  test('carries contact message fields into the plain-text part', async () => {
    const result = await getTemplate({
      template: 'contactMessage',
      context: {
        name: 'Grace Hopper',
        email: 'grace@example.test',
        message: 'The compiler demo is impressive.',
      },
    });

    expect(result.text).toContain('Grace Hopper');
    expect(result.text).toContain('grace@example.test');
    expect(result.text).toContain('The compiler demo is impressive.');
  });
});
