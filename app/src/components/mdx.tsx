/**
 * Components available in every lesson .mdx file WITHOUT importing them.
 * (Unit-specific widgets should be imported at the top of the .mdx file.)
 */
import React from 'react';
import { Quiz, NumQuiz, Predict, Q, Opt, Explain, Reveal, Hint } from './lesson/Quiz';
import { KeyIdea, Note, Warning, History, CSCorner, Try, Definition, DeepDive, Watch, Columns } from './lesson/Callouts';
import { Tex, RichText, Slider, Toggle, Widget } from './ui';
import { BlochSphere } from '../widgets/BlochSphere';
import { BlochPlayground } from '../widgets/BlochPlayground';
import { CircuitLab } from '../widgets/CircuitLab';
import { AmplitudeView, PhasorClock, PhaseLegend } from '../widgets/AmplitudeView';
import { MiniBloch } from '../widgets/MiniBloch';
import { Plot } from '../widgets/Plot';
import { ParamPlot } from '../widgets/ParamPlot';

export const mdxComponents = {
  // checkpoints
  Quiz, NumQuiz, Predict, Q, Opt, Explain, Reveal, Hint,
  // callouts
  KeyIdea, Note, Warning, History, CSCorner, Try, Definition, DeepDive, Watch, Columns,
  // primitives
  Tex, RichText, Slider, Toggle, Widget,
  // shared widgets
  BlochSphere, BlochPlayground, CircuitLab, AmplitudeView, PhasorClock, PhaseLegend, MiniBloch, Plot, ParamPlot,
  // open external links in a new window
  a: (p: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...p} target={p.href?.startsWith('#') ? undefined : '_blank'} rel="noreferrer" />,
};
