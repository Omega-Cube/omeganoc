#!/usr/bin/env python
#
# This file is part of Omega Noc

""" Unit tests for the on_reader.livestatus lib
"""

from omeganoc_tests.basetestclass import OmegaNocTestCase
from on_reader.livestatus import livestatus
from on_reader.livestatus import SUPPORTED, FILTER_KEYS
from on_reader.livestatus import LiveStatus, Query, Element,\
                                           get_status_logs, get_systemstructure_data
from pprint import pprint, pformat

import time
class Timer(object):
    def __init__(self, verbose=False):
        self.verbose = verbose

    def __enter__(self):
        self.start = time.time()
        return self

    def __exit__(self, *args):
        self.end = time.time()
        self.secs = self.end - self.start
        self.msecs = self.secs * 1000  # millisecs
        if self.verbose:
            print 'elapsed time: %f ms' % self.msecs

class DataReaderLiveStatusBaseTestCase(OmegaNocTestCase):
    def setUp(self):
        super(DataReaderLiveStatusBaseTestCase, self).setUp()
        return
        # This is a "test" of whether the configuration files
        # in /etc/shinken are the omegacube configuration files
        # which define a host named blackmamba (which should be
        # an uncommon name)
        #
        # if not, there are two things that must be done
        # to setup the omeganoc configuration files. As root run:
        #
        # sudo ln -s /etc/shinken_omeganoc /etc/shinken
        # sudo ln -s /etc/default/shinken_omeganoc /etc/default/shinken
        #
        # The two lines above assume that the file/directory linked-to
        # exists
        try:
            livestatus.hosts.blackmamba
        except:
            msg = """
The livestatus tests assume that you've configured shinken to run with the
omeganoc
test configuration files, as well as installed the needed shinken modules.
Please fix these two problems before running the tests.
            """.strip()
            raise Exception(" ".join(msg.split()))


class DataReaderLiveStatusTestCase(DataReaderLiveStatusBaseTestCase):

    def test_livestatus(self):
        self.assertIsInstance(livestatus, LiveStatus)
        for key in SUPPORTED:
            self.assertIsInstance(getattr(livestatus, key), Query)

    def test_getattr(self):
        self.assertIsInstance(livestatus.services, Query)
        self.assertIsInstance(livestatus.services.Memory, list)
        self.assertEqual(livestatus.services["Memory"][0].display_name, "Memory")

    def test_getitem(self):
        self.assertIsInstance(livestatus["services"], Query)
        self.assertIsInstance(livestatus["services"]["Memory"], list)
        self.assertEqual(livestatus["services"]["Memory"][0]["display_name"], "Memory")

    def test_raw(self):
        self.assertIsInstance(livestatus.raw(), list)
        self.assertIsInstance(livestatus.services.raw(), list)
        self.assertIsInstance(livestatus["services"]["Memory"][0].raw(), dict)
        self.assertIsInstance(livestatus["services"]["Memory"][0]["display_name"], basestring)

    def test_subelement_filtering(self):
        self.assertIsInstance(livestatus.hosts.blackmamba, Element)
        self.assertIsInstance(livestatus.hosts.blackmamba.services, list)
        self.assertIsInstance(livestatus.hosts.blackmamba["*"], list)
        self.assertIsInstance(livestatus.hosts.blackmamba.Memory, Element)

    def test_get_systemstructure_data(self):
        for item in get_systemstructure_data('blackmamba.*'):
            self.assertIsInstance(item, Element)
            self.assertEqual(item.raw()['host_name'], 'blackmamba')
        element = get_systemstructure_data('blackmamba.Memory')
        self.assertIsInstance(element, Element)
        self.assertEqual(element.raw()['host_name'], 'blackmamba')
        self.assertIsInstance(get_systemstructure_data('*.Memory'), list)
        self.assertIsInstance(get_systemstructure_data('*.*'), list)

    def test_wrong_request(self):
        request = 'GET log\nFilter: host_name = blackmamba\nFilter: time >= 1394970702\nFilter: time <= 2014-06-24 12:51:42.951290\n\n'
        self.assertRaises(Exception, livestatus._query.call, request)
