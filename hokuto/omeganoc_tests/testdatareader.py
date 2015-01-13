#!/usr/bin/env python
#Copyright (C) 2010-2012 Omega Cube
#  Xavier Roger-Machart, xrm@omegacube.fr
#
# This file is part of Omega Noc

""" Unit tests for the datareader module
"""

from shinken.objects.config import Config
from omeganoc_tests.basetestclass import OmegaNocTestCase

class DataReaderMetroLogicTestCase(OmegaNocTestCase):
    def test_eval_qs(self):
        import random
        import types
        from on_reader import metrologic
        from graphite.query.datalib import TimeSeries
        from graphite.query import get_all_leaf_nodes

        # We get all possible targets and pick one randomly
        targets = get_all_leaf_nodes()
        target = random.choice(targets)
        data = metrologic.eval_qs("target=%s"%target)

        # The result can be a TimeSeries object, or None, depending
        # on the actual values in the time-numeric database
        self.assertIsInstance(data[0], (TimeSeries, types.NoneType))
