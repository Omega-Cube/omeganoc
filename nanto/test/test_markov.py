import time
import unittest
from mock import Mock

from graphitequery import query
from graphitequery.query.datalib import TimeSeries

from module.markov_states_worker import MarkovStatesWorker

class TestMarkov(unittest.TestCase):
    """Unit testing the module features"""

    def test_generate_los_simple(self):
        old_time = time.time
        time.time = lambda: 601 # We'll test values for 11 data points
        events = [{'time': 10, 'state': 2},
                  {'time': 70, 'state': 1},
                  {'time': 500, 'state': 0}]

        los = MarkovStatesWorker._MarkovStatesWorker__create_los_from_events(events, 0)

        self.assertListEqual(los, [0, 2, 1, 1, 1, 1, 1, 1, 1, 0, 0])

    def test_generate_los_skip(self):
        old_time = time.time
        time.time = lambda: 601 # We'll test values for 11 data points
        events = [{'time': 10, 'state': 2},
                  {'time': 65, 'state': 3}, # This event should be erased by the next one because they happen in the same minute
                  {'time': 70, 'state': 1},
                  {'time': 500, 'state': 0}]

        los = MarkovStatesWorker._MarkovStatesWorker__create_los_from_events(events, 0)

        self.assertListEqual(los, [0, 2, 1, 1, 1, 1, 1, 1, 1, 0, 0])

