import { Font, Image, Path, Rect, Svg, Text, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

/**
 * Registers Noto Sans (Regular/SemiBold/Bold). The built-in PDF fonts have no U+20B9 rupee glyph,
 * so this must run before rendering. `base` is '/fonts' in the browser or an absolute dir in Node.
 */
let registeredBase: string | null = null;
export function registerFonts(base: string) {
  if (registeredBase === base) return;
  Font.register({
    family: 'NotoSans',
    fonts: [
      { src: `${base}/NotoSans-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/NotoSans-SemiBold.ttf`, fontWeight: 600 },
      { src: `${base}/NotoSans-Bold.ttf`, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]); // no mid-word hyphenation
  registeredBase = base;
}

/** Pulls <rect>/<path> shapes out of the app's generated SVG data URIs so they can be drawn as vectors. */
function parseSvg(dataUri: string) {
  if (!dataUri.startsWith('data:image/svg+xml')) return null;
  const svg = decodeURIComponent(dataUri.slice(dataUri.indexOf(',') + 1));
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1];
  if (!vb) return null;
  const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
  const fix = (c?: string) => (!c || c === 'none' ? undefined : c.startsWith('url(') ? '#F5B544' : c);
  const shapes: { type: 'rect' | 'path'; tag: string }[] = [];
  for (const m of svg.matchAll(/<(rect|path)\b[^>]*>/g)) shapes.push({ type: m[1] as 'rect' | 'path', tag: m[0] });
  return { vb, shapes, attr, fix };
}

export function Vector({ uri, w, h, fallback }: { uri: string; w: number; h: number; fallback: string }): ReactElement {
  if (/^data:image\/(png|jpe?g)/.test(uri)) return <Image src={uri} style={{ width: w, height: h }} />;
  const p = parseSvg(uri);
  if (!p) {
    return (
      <View style={{ width: w, height: h, borderRadius: 6, backgroundColor: '#0B1220', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#F5B544', fontWeight: 700, fontSize: h * 0.34 }}>{fallback}</Text>
      </View>
    );
  }
  return (
    <Svg viewBox={p.vb} style={{ width: w, height: h }}>
      {p.shapes.map((s, i) =>
        s.type === 'rect'
          ? <Rect key={i} x={Number(p.attr(s.tag, 'x') ?? 0)} y={Number(p.attr(s.tag, 'y') ?? 0)} width={Number(p.attr(s.tag, 'width'))} height={Number(p.attr(s.tag, 'height'))}
              rx={Number(p.attr(s.tag, 'rx') ?? 0)} fill={p.fix(p.attr(s.tag, 'fill')) ?? '#000'} />
          : <Path key={i} d={p.attr(s.tag, 'd') ?? ''} fill={p.fix(p.attr(s.tag, 'fill'))} stroke={p.fix(p.attr(s.tag, 'stroke'))} strokeWidth={Number(p.attr(s.tag, 'stroke-width') ?? 1)} />,
      )}
    </Svg>
  );
}
