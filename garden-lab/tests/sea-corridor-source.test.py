"""Optional source-generator checks: Python + numpy + pyproj, no network."""
import importlib.util
import math
from pathlib import Path
import unittest

import numpy as np

path = Path(__file__).resolve().parents[1] / 'scripts/build-sea-corridor.py'
spec = importlib.util.spec_from_file_location('sea_source', path)
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


class ConservativeDSM(unittest.TestCase):
    def setUp(self):
        self.header = {'xllcenter': -1.75, 'yllcenter': -1.75, 'cellsize': .5}
        self.values = np.zeros((12, 12), dtype=np.float32)
        self.origin = np.array([.46, .31])
        angle = math.radians(39)
        self.direction = np.array([math.sin(angle), math.cos(angle)])

    def test_grid_corner_obstacle_between_old_point_samples_is_retained(self):
        # Cell E=[.5,1.0], N=[0,.5] is intersected by the central ray
        # between d=.0636 and .2445 m. Old quarter-metre samples miss it.
        self.values[4, 5] = 30
        tops, points, missing = source.conservative_bins(
            (self.header, self.values), self.origin, self.direction, np.array([0.]), 1.)
        self.assertEqual(tops[0], 30)
        self.assertFalse(missing[0])
        np.testing.assert_allclose(points[0], [.75, .25])

    def test_missing_corner_cell_is_not_converted_to_clear_sky(self):
        self.values[4, 5] = np.nan
        _, _, missing = source.conservative_bins(
            (self.header, self.values), self.origin, self.direction, np.array([0.]), 1.)
        self.assertTrue(missing[0])

    def test_outside_the_source_is_missing_not_edge_clamped(self):
        _, _, missing = source.conservative_bins(
            (self.header, self.values), np.array([20., 20.]), self.direction, np.array([0.]), 1.)
        self.assertTrue(missing[0])


if __name__ == '__main__':
    unittest.main()
