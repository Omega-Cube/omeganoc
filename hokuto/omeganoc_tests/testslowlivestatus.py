#!/usr/bin/env python
#
# This file is part of Omega Noc

""" Unit tests for the datareader.livestatus module
"""

import os
import datetime
from on_reader.livestatus import livestatus
from on_reader.livestatus import SUPPORTED, FILTER_KEYS, SERVER_ADDRESS
from on_reader.livestatus import LiveStatus, Query, Element,\
                                           get_status_logs, get_systemstructure_data
from pprint import pprint, pformat
from omeganoc_tests.testlivestatus import Timer, DataReaderLiveStatusBaseTestCase

class DataReaderSlowLiveStatusTestCase(DataReaderLiveStatusBaseTestCase):
    def test_get_status_logs(self):
        msg = "This test assumes that the files %s and %s exist." \
              " If not, you can find them in the onoc/log directory" \
              " and copy them to /var/log/shinken/archives/"
        log_files = ('/var/log/shinken/archives/livelogs-2014-05-23.db',
                     '/var/log/shinken/archives/shinken-05-23-2014-00.log')
        for path in log_files:
            if not os.path.exists(path):
                raise Exception(msg%log_files)
        time_from = datetime.datetime(2014, 5, 23, 0, 0, 0, 0).strftime("%s")
        time_to = datetime.datetime(2014, 5, 23, 23, 59, 59, 999).strftime("%s")
        def my_get_status_logs(*args, **kwargs):
            kwargs["time_from"] = time_from
            kwargs["time_to"] = time_to
            return get_status_logs(*args, **kwargs)

        self.assertIsInstance(my_get_status_logs('blackmamba.Memory'), list)
        self.assertIsInstance(my_get_status_logs('*.Memory'), list)
        self.assertIsInstance(my_get_status_logs('*.*'), list)
        self.assertFalse(my_get_status_logs('*.*', class_=0))
        self.assertTrue(my_get_status_logs('*.*', class_=1))
        self.assertTrue(my_get_status_logs('*.*', class_=[1, 2]))
        self.assertFalse(my_get_status_logs('*.*', class_=[4, 2, 3]))

    def test_caching(self):
        def run():
            for i in range(5):
                livestatus.hosts.blackmamba.services

        # Cached run
        livestatus._query._cache = True
        with Timer() as t_cached:
            run()
        # Non-cached run
        livestatus._query._cache = False
        livestatus.clear_cache()
        with Timer() as t_non_cached:
            run()
        print
        print "Duration of cached run:", t_cached.msecs
        print "Duration of non-cached run:", t_non_cached.msecs
        print "The duration of the non-cached run was more than %d "\
              "times longer"%\
              (t_non_cached.msecs/t_cached.msecs)
        livestatus.clear_cache()
        self.assertEqual(len(livestatus._query._cache_call), 0)
        self.assertGreater(t_non_cached.msecs, t_cached.msecs)

    def test_cache_whole_structure(self):
        def run():
            for key, value in FILTER_KEYS.iteritems():
                # list_ might be, for example, "hosts"
                list_ = getattr(livestatus, key)
                list_raw = list_.raw()
                for el in list_raw:
                    if value is not None:
                        getattr(list_, el[value])

        # Non-cached run
        livestatus._query._cache = False
        livestatus.clear_cache()
        with Timer() as t_non_cached:
            run()

        # Cached run
        livestatus._query._cache = True
        with Timer() as t_caching:
            livestatus.cache_whole_structure()
        cached_items = len(livestatus._query._cache_call)

        # Repeat the run again and set the port to some silly address.
        # It should raise an error if something was not cached
        # Note: *do not* set the port with livestatus.set_server_address
        # as this will invalidate the cache (which we are trying to test)
        livestatus._query.peer = ("127.0.0.1", 50001)
        with Timer() as t_cached:
            run()

        print
        print cached_items, "items in cache"
        print "Duration of caching:", t_caching.msecs
        print "Duration of cached run:", t_cached.msecs
        print "Duration of non-cached run:", t_non_cached.msecs
        print "The duration of the non-cached run was more than %d "\
              "times longer"%\
              (t_non_cached.msecs/t_cached.msecs)
        # Reset the socket port to its normal value
        livestatus._query.peer = SERVER_ADDRESS
        livestatus.clear_cache()
        self.assertEqual(len(livestatus._query._cache_call), 0)
        self.assertGreater(t_non_cached.msecs, t_cached.msecs)
