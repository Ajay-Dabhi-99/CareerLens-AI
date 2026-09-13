import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

/*
 * Pages are lazy-loaded, so the first findBy on a route waits for a dynamic
 * import. The 1s default passes alone but flakes when the whole workspace runs
 * in parallel and the machine is busy. A longer ceiling costs nothing when the
 * element appears quickly — findBy returns as soon as it does.
 */
configure({ asyncUtilTimeout: 5000 });
