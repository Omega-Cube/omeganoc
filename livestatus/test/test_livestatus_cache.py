


import os
import sys
import datetime
import time
import random

from shinken_test import unittest, time_hacker

sys.path.append('../shinken/modules')

from shinken_modules import TestConfig
from shinken.comment import Comment

from mock_livestatus import mock_livestatus_handle_request


@mock_livestatus_handle_request
class TestConfigBig(TestConfig):
    def setUp(self):

        start_setUp = time.time()
        self.setup_with_file('etc/shinken_5r_100h_2000s.cfg')
        Comment.id = 1
        self.testid = str(os.getpid() + random.randint(1, 1000))
        self.init_livestatus(needcache=True)
        print "Cleaning old broks?"
        self.sched.conf.skip_initial_broks = False
        self.sched.brokers['Default-Broker'] = {'broks' : {}, 'has_full_broks' : False}
        self.sched.fill_initial_broks('Default-Broker')

        self.update_broker()
        print "************* Overall Setup:", time.time() - start_setUp
        # add use_aggressive_host_checking so we can mix exit codes 1 and 2
        # but still get DOWN state
        host = self.sched.hosts.find_by_name("test_host_000")
        host.__class__.use_aggressive_host_checking = 1

    def test_stats(self):
        self.print_header()
        now = time.time()
        objlist = []
        for host in self.sched.hosts:
            objlist.append([host, 0, 'UP'])
        for service in self.sched.services:
            objlist.append([service, 0, 'OK'])
        self.scheduler_loop(1, objlist)
        self.update_broker()
        svc1 = self.sched.services.find_srv_by_name_and_hostname("test_host_005", "test_ok_00")
        print svc1
        svc2 = self.sched.services.find_srv_by_name_and_hostname("test_host_005", "test_ok_15")
        print svc2
        svc3 = self.sched.services.find_srv_by_name_and_hostname("test_host_005", "test_ok_16")
        print svc3
        svc4 = self.sched.services.find_srv_by_name_and_hostname("test_host_007", "test_ok_05")
        print svc4
        svc5 = self.sched.services.find_srv_by_name_and_hostname("test_host_007", "test_ok_11")
        svc6 = self.sched.services.find_srv_by_name_and_hostname("test_host_025", "test_ok_01")
        svc7 = self.sched.services.find_srv_by_name_and_hostname("test_host_025", "test_ok_03")

        request = """GET services
Filter: description = test_ok_11
Filter: host_name = test_host_007
Columns: host_name description state state_type"""
        beforeresponse, keepalive = self.livestatus_broker.livestatus.handle_request(request)
        print "before", beforeresponse

        self.scheduler_loop(1, [[svc1, 1, 'W'], [svc2, 1, 'W'], [svc3, 1, 'W'], [svc4, 2, 'C'], [svc5, 3, 'U'], [svc6, 2, 'C'], [svc7, 2, 'C']])
        self.update_broker()
        # 1993O, 3xW, 3xC, 1xU
        statsrequest = """GET services
Filter: contacts >= test_contact
Stats: state != 9999
Stats: state = 0
Stats: state = 1
Stats: state = 2
Stats: state = 3"""
        response, keepalive = self.livestatus_broker.livestatus.handle_request(statsrequest)
        print 'query_6_______________\n%s\n%s\n' % (statsrequest, response)
        self.assert_(response == '2000;1993;3;3;1\n')

        # Now we play with the cache
        afterresponse, keepalive = self.livestatus_broker.livestatus.handle_request(request)
        print "after", afterresponse
        self.assert_(beforeresponse != afterresponse)
        repeatedresponse, keepalive = self.livestatus_broker.livestatus.handle_request(request)
        print "repeated", repeatedresponse
        self.assert_(afterresponse == repeatedresponse)

        self.scheduler_loop(2, [[svc5, 2, 'C']])
        self.update_broker()
        notcachedresponse, keepalive = self.livestatus_broker.livestatus.handle_request(request)
        print "notcached", notcachedresponse

        self.scheduler_loop(2, [[svc5, 0, 'O']])
        self.update_broker()
        # 1994O, 3xW, 3xC, 0xU
        againnotcachedresponse, keepalive = self.livestatus_broker.livestatus.handle_request(request)
        print "againnotcached", againnotcachedresponse
        self.assert_(notcachedresponse != againnotcachedresponse)
        finallycachedresponse, keepalive = self.livestatus_broker.livestatus.handle_request(request)
        print "finallycached", finallycachedresponse
        self.assert_(againnotcachedresponse == finallycachedresponse)

        request = """GET services
Filter: contacts >= test_contact
Stats: state != 9999
Stats: state = 0
Stats: state = 1
Stats: state = 2
Stats: state = 3"""
        response, keepalive = self.livestatus_broker.livestatus.handle_request(statsrequest)
        print 'query_6_______________\n%s\n%s\n' % (statsrequest, response)
        response, keepalive = self.livestatus_broker.livestatus.handle_request(statsrequest)
        print 'query_6_______________\n%s\n%s\n' % (statsrequest, response)
        self.assert_(response == '2000;1994;3;3;0\n')

    def test_a_long_history(self):
        #return
        print datetime.datetime.now()
        print datetime.datetime.today()
        test_host_005 = self.sched.hosts.find_by_name("test_host_005")
        test_host_099 = self.sched.hosts.find_by_name("test_host_099")
        test_ok_00 = self.sched.services.find_srv_by_name_and_hostname("test_host_005", "test_ok_00")
        test_ok_01 = self.sched.services.find_srv_by_name_and_hostname("test_host_005", "test_ok_01")
        test_ok_04 = self.sched.services.find_srv_by_name_and_hostname("test_host_005", "test_ok_04")
        test_ok_16 = self.sched.services.find_srv_by_name_and_hostname("test_host_005", "test_ok_16")
        test_ok_99 = self.sched.services.find_srv_by_name_and_hostname("test_host_099", "test_ok_01")
        days = 4

        etime = time.time()
        print "now it is", time.ctime(etime)
        print "now it is", time.gmtime(etime)
        etime_midnight = (etime - (etime % 86400)) + time.altzone
        print "midnight was", time.ctime(etime_midnight)
        print "midnight was", time.gmtime(etime_midnight)
        query_start = etime_midnight - (days - 1) * 86400
        query_end = etime_midnight
        print "query_start", time.ctime(query_start)
        print "query_end ", time.ctime(query_end)

        # |----------|----------|----------|----------|----------|---x
        #                                                            etime
        #                                                        etime_midnight
        #             ---x------
        #                etime -  4 days
        #                       |---
        #                       query_start
        #
        #                ............................................
        #                events in the log database ranging till now
        #
        #                       |________________________________|
        #                       events which will be read from db
        #
        loops = int(86400 / 192)
        time_hacker.time_warp(-1 * days * 86400)
        print "warp back to", time.ctime(time.time())
        # run silently
        old_stdout = sys.stdout
        sys.stdout = open(os.devnull, "w")
        should_be = 0
        for day in xrange(days):
            sys.stderr.write("day %d now it is %s i run %d loops\n" % (day, time.ctime(time.time()), loops))
            self.scheduler_loop(2, [
                [test_ok_00, 0, "OK"],
                [test_ok_01, 0, "OK"],
                [test_ok_04, 0, "OK"],
                [test_ok_16, 0, "OK"],
                [test_ok_99, 0, "OK"],
            ])
            self.update_broker()
            #for i in xrange(3600 * 24 * 7):
            for i in xrange(loops):
                if i % 10000 == 0:
                    sys.stderr.write(str(i))
                if i % 399 == 0:
                    self.scheduler_loop(3, [
                        [test_ok_00, 1, "WARN"],
                        [test_ok_01, 2, "CRIT"],
                        [test_ok_04, 3, "UNKN"],
                        [test_ok_16, 1, "WARN"],
                        [test_ok_99, 2, "CRIT"],
                    ])
                    if int(time.time()) >= query_start and int(time.time()) <= query_end:
                        should_be += 3
                        sys.stderr.write("now it should be %s\n" % should_be)
                time.sleep(62)
                if i % 399 == 0:
                    self.scheduler_loop(1, [
                        [test_ok_00, 0, "OK"],
                        [test_ok_01, 0, "OK"],
                        [test_ok_04, 0, "OK"],
                        [test_ok_16, 0, "OK"],
                        [test_ok_99, 0, "OK"],
                    ])
                    if int(time.time()) >= query_start and int(time.time()) <= query_end:
                        should_be += 1
                        sys.stderr.write("now it should be %s\n" % should_be)
                time.sleep(2)
                if i % 9 == 0:
                    self.scheduler_loop(3, [
                        [test_ok_00, 1, "WARN"],
                        [test_ok_01, 2, "CRIT"],
                    ])

                time.sleep(62)
                if i % 9 == 0:
                    self.scheduler_loop(1, [
                        [test_ok_00, 0, "OK"],
                        [test_ok_01, 0, "OK"],
                    ])
                time.sleep(2)
                if i % 9 == 0:
                    self.scheduler_loop(3, [
                        [test_host_005, 2, "DOWN"],
                    ])
                if i % 2 == 0:
                    self.scheduler_loop(3, [
                        [test_host_099, 2, "DOWN"],
                    ])
                time.sleep(62)
                if i % 9 == 0:
                    self.scheduler_loop(3, [
                        [test_host_005, 0, "UP"],
                    ])
                if i % 2 == 0:
                    self.scheduler_loop(3, [
                        [test_host_099, 0, "UP"],
                    ])
                time.sleep(2)
                self.update_broker()
                if i % 1000 == 0:
                    self.livestatus_broker.db.commit()
            endtime = time.time()
            self.livestatus_broker.db.commit()
            sys.stderr.write("day %d end it is %s\n" % (day, time.ctime(time.time())))
        sys.stdout.close()
        sys.stdout = old_stdout
        self.livestatus_broker.db.commit_and_rotate_log_db()

        numlogs = self.livestatus_broker.db.execute("SELECT count(*) FROM logs")
        print "numlogs is", numlogs

        # now we have a lot of events
        # find type = HOST ALERT for test_host_005
        request = """GET log
Columns: class time type state host_name service_description plugin_output message options contact_name command_name state_type current_host_groups current_service_groups
Filter: time >= """ + str(int(query_start)) + """
Filter: time <= """ + str(int(query_end)) + """
Filter: type = SERVICE ALERT
And: 1
Filter: type = HOST ALERT
And: 1
Filter: type = SERVICE FLAPPING ALERT
Filter: type = HOST FLAPPING ALERT
Filter: type = SERVICE DOWNTIME ALERT
Filter: type = HOST DOWNTIME ALERT
Filter: type ~ starting...
Filter: type ~ shutting down...
Or: 8
Filter: host_name = test_host_099
Filter: service_description = test_ok_01
And: 5
OutputFormat: json"""
        # switch back to realtime. we want to know how long it takes
        time_hacker.set_real_time()

        print self.livestatus_broker.db.database_file
        print request
        print "query 1 --------------------------------------------------"
        tic = time.time()
        response, keepalive = self.livestatus_broker.livestatus.handle_request(request)
        tac = time.time()
        elapsed1 = tac - tic
        pyresponse = eval(response)
        print "pyresponse", len(pyresponse)
        print "should be", should_be
        self.assertEqual(should_be, len(pyresponse))
        print "query 2 cache---------------------------------------------"
        tic = time.time()
        response, keepalive = self.livestatus_broker.livestatus.handle_request(request)
        tac = time.time()
        elapsed2 = tac - tic
        pyresponse = eval(response)
        self.assert_(len(pyresponse) == should_be)
        print "clear the cache"
        print "use aggressive sql"
        print "query 3 --------------------------------------------------"
        self.livestatus_broker.query_cache.wipeout()
        self.livestatus_broker.db.use_aggressive_sql = True
        tic = time.time()
        response, keepalive = self.livestatus_broker.livestatus.handle_request(request)
        tac = time.time()
        elapsed3 = tac - tic
        pyresponse = eval(response)
        self.assert_(len(pyresponse) == should_be)
        print "query 4 cache---------------------------------------------"
        tic = time.time()
        response, keepalive = self.livestatus_broker.livestatus.handle_request(request)
        tac = time.time()
        elapsed4 = tac - tic
        pyresponse = eval(response)
        self.assert_(len(pyresponse) == should_be)
        print "elapsed1", elapsed1
        print "elapsed2", elapsed2
        print "elapsed3", elapsed3
        print "elapsed4", elapsed4
        msg = """~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
NB NB NB: This isn't necessarily a failure !!! This check highly depends on the system load there was while the test was running.
Maybe you could relaunch the test and it will succeed.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
"""
        self.assert_(elapsed2 < elapsed1 / 10, msg)
        self.assert_(elapsed3 < elapsed1, msg)
        self.assert_(elapsed4 < elapsed3, msg)

        time_hacker.set_my_time()



if __name__ == '__main__':
    #import cProfile
    command = """unittest.main()"""
    unittest.main()
    #cProfile.runctx( command, globals(), locals(), filename="/tmp/livestatus.profile" )

    #allsuite = unittest.TestLoader.loadTestsFromModule(TestConfig)
    #unittest.TextTestRunner(verbosity=2).run(allsuite)
