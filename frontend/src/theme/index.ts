import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Design tokens — the single source of truth for the app's visual language.
 *
 * Direction: "darkroom instrument". A warm espresso ground rather than the
 * cool slate a device utility usually reaches for, so the status accents read
 * as indicator lamps on a panel instead of as UI chrome. Amber is the working
 * accent; mint is reserved exclusively for "the link is live", which is the
 * one thing this app exists to tell you at a glance.
 *
 * Nothing here needs a native module. Gradients would require
 * expo-linear-gradient and therefore a new build, so depth comes from layered
 * surfaces, hairline borders and elevation instead.
 */

// ── color ─────────────────────────────────────────────────────────────────────

export const color = {
  /** App ground. Warm, so it never reads as flat black. */
  bg: '#14100E',
  /** Default card surface, one step up from the ground. */
  surface: '#1E1815',
  /** Elevated surface: stat tiles, pressed states, nested blocks. */
  surfaceRaised: '#2A221E',
  /** Hairline borders — what gives cards a crisp edge against the ground. */
  line: '#3B322C',
  /** Slightly brighter line for emphasis or focus. */
  lineStrong: '#544840',

  text: '#F6F0EA',
  /** Body copy and secondary values. */
  textDim: '#C9BDB3',
  /** Labels, captions, anything deliberately recessive. */
  textMuted: '#A79A90',

  /** Primary accent — the "on" light. */
  signal: '#E8913A',
  /** Pressed/active amber. */
  signalDeep: '#C2701F',
  /** Amber at low opacity, for tinted fills behind the accent. */
  signalWash: 'rgba(232, 145, 58, 0.14)',

  /** Reserved for connection-live state. Used sparingly and nowhere else. */
  live: '#52D6A8',
  liveWash: 'rgba(82, 214, 168, 0.14)',

  danger: '#E8564C',
  dangerDeep: '#C13B32',
  dangerWash: 'rgba(232, 86, 76, 0.14)',

  /** Locked/attention state. */
  warn: '#E8C15A',
  warnWash: 'rgba(232, 193, 90, 0.14)',

  /** Text that sits on top of a filled accent. */
  onAccent: '#17110C',
} as const;

// ── spacing: strict 8pt grid (xs is the only half-step) ───────────────────────

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ── radii ─────────────────────────────────────────────────────────────────────

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

// ── elevation ─────────────────────────────────────────────────────────────────
//
// React Native has no multi-layer box-shadow, so depth is built from three
// stacked cues instead: a cast shadow, a hairline border, and a surface that's
// lighter than what's behind it. On a dark ground the border and the surface
// step do most of the work — shadows alone are nearly invisible here.

export const elevation = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
    },
    android: { elevation: 3 },
    default: {},
  })!,
  raised: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.45,
      shadowRadius: 20,
    },
    android: { elevation: 8 },
    default: {},
  })!,
} as const;

// ── typography ────────────────────────────────────────────────────────────────
//
// No custom faces: expo-font is a native module and adding it would force a
// rebuild. Personality comes from weight, tracking and case instead of from a
// typeface — wide-tracked uppercase micro-labels against tight, heavy
// tabular numerals, which is how instrument panels are actually set.

export const type = {
  /** Screen titles. */
  display: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: color.text,
  } as TextStyle,
  /** Card headings. */
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: color.text,
  } as TextStyle,
  body: {
    fontSize: 15,
    fontWeight: '500',
    color: color.textDim,
  } as TextStyle,
  /** Secondary copy and hints. */
  caption: {
    fontSize: 13,
    fontWeight: '500',
    color: color.textMuted,
    lineHeight: 18,
  } as TextStyle,
  /** Wide-tracked uppercase instrument label. */
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: color.textMuted,
  } as TextStyle,
  /** Telemetry readouts — tabular so digits don't jitter as values change. */
  readout: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: color.text,
    fontVariant: ['tabular-nums'],
  } as TextStyle,
  button: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  } as TextStyle,
} as const;

/** Minimum comfortable touch target. */
export const HIT = 44;

export const theme = { color, space, radius, elevation, type, HIT };
export default theme;
