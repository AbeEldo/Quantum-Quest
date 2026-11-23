import { Mat, isUnitary } from './complex';
import { Mat2, mat2ToMat } from './qsim';

export const mat2 = (m: Mat2): Mat => mat2ToMat(m);
export { isUnitary };
