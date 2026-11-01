import { describe, expect, it } from 'vitest';
import { classicBuild, ORIGINAL_PAINT, type RobotBuild } from '../content/robot-parts.ts';
import { ROBOT_COLORS } from '../roster.ts';
import {
  CURE_MAX,
  CURE_PER_CARROT,
  cleanCure,
  cleanSettings,
  coatOpacity,
  cureAfter,
  cureText,
  DEFAULT_SETTINGS,
  FRESH_COAT,
  freshCoat,
  hasPaint,
  repainted,
} from './paint-cure.ts';

const RED = ROBOT_COLORS[1]?.hex as string;
const BLUE = ROBOT_COLORS[2]?.hex as string;

describe('paint cure', () => {
  it('starts a fresh coat at 10%, a point a carrot, so a full coat takes 90 carrots', () => {
    expect(freshCoat()).toBe(10);
    expect(FRESH_COAT).toBe(10);
    expect(CURE_PER_CARROT).toBe(1);
    expect(cureAfter(freshCoat(), 1)).toBe(11);
    expect(cureAfter(freshCoat(), 27)).toBe(37);
    expect(cureAfter(freshCoat(), 90)).toBe(CURE_MAX);
  });

  it('caps at 100, and a fully cured robot eats with no effect', () => {
    expect(cureAfter(99, 5)).toBe(100);
    expect(cureAfter(100, 1)).toBe(100);
  });

  it('never goes backwards', () => {
    expect(cureAfter(40, -3)).toBe(40);
    expect(cureAfter(40, 0.9)).toBe(40);
  });

  it('cleans an owner-typed cure to a whole percent', () => {
    expect(cleanCure(37)).toBe(37);
    expect(cleanCure('55')).toBe(55);
    expect(cleanCure(36.6)).toBe(37);
    expect(cleanCure(150)).toBe(100);
    expect(cleanCure(-4)).toBe(0);
    for (const bad of [undefined, null, '', 'lots', Number.NaN, {}]) expect(cleanCure(bad)).toBeUndefined();
  });

  it('draws every coat fully cured while paint cure is off', () => {
    expect(coatOpacity(10, false)).toBe(1);
    expect(coatOpacity(10, true)).toBeCloseTo(0.1);
    expect(coatOpacity(100, true)).toBe(1);
  });

  it('knows a robot with any painted part', () => {
    expect(hasPaint(classicBuild())).toBe(false);
    expect(hasPaint(classicBuild(RED))).toBe(true);
  });

  it('starts a fresh coat only for new paint', () => {
    const red = classicBuild(RED);
    expect(repainted(red, red)).toBe(false);
    expect(repainted(red, classicBuild(BLUE))).toBe(true);
    expect(repainted(classicBuild(), red)).toBe(true);
    // back to the original skin, or a part taken off: no new coat
    expect(repainted(red, classicBuild())).toBe(false);
    const noHead: RobotBuild = { ...red, head: null };
    expect(repainted(red, noHead)).toBe(false);
    // a different part in the same paint keeps its coat; a new part in a color is new paint
    expect(repainted(red, { ...red, head: { part: 'visor', paint: RED } })).toBe(false);
    expect(repainted(noHead, { ...noHead, head: { part: 'visor', paint: BLUE } })).toBe(true);
    expect(repainted(noHead, { ...noHead, head: { part: 'visor', paint: ORIGINAL_PAINT } })).toBe(false);
  });

  it('reads the HUD as a whole percent', () => {
    expect(cureText(37)).toBe('Paint 37%');
  });

  it('reads settings, keeping defaults for anything missing or malformed', () => {
    expect(DEFAULT_SETTINGS.paintCure).toBe(false);
    expect(cleanSettings(undefined)).toEqual({ paintCure: false });
    expect(cleanSettings({ paintCure: true })).toEqual({ paintCure: true });
    expect(cleanSettings({ paintCure: 'yes' })).toEqual({ paintCure: false });
    expect(cleanSettings({}, { paintCure: true })).toEqual({ paintCure: true });
  });
});
