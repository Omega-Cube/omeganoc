import time
import unittest
from mock import Mock
from multiprocessing import Value

from omeganoc.predict.module.module import PredictionWorkerContainer
from omeganoc.predict.module.prediction_worker import PredictionWorker

class FakeWorker(PredictionWorker):
    def __init__(self):
        return super(FakeWorker, self).__init__(60, 'fake', 1)

    def internal_run(self):
        pass

    def start(self):
        # Don't start a new process, lol
        pass

    def is_alive(self):
        return False

class FakeModule(object):
    def __init__(self):
        self.error_interval = 600
        self.storage = '/tmp/predict/'
        self.debug_worker = None

class TestModule(unittest.TestCase):
    """Unit testing the module features"""
    def setUp(self):
        self.fake_module = FakeModule()

    def test_worker_container_init(self):
        # Monkey patch the time() function
        real_time = time.time
        time.time = lambda: 0

        subject = PredictionWorkerContainer(FakeWorker, self.fake_module)
        self.assertIsNotNone(subject.container)
        self.assertIsInstance(subject.worker_instance, FakeWorker)
        self.assertEquals(60, subject.next_run_time)

        time.time = real_time

    def test_worker_check_wait(self):
        real_time = time.time
        time.time = lambda: 0

        subject = PredictionWorkerContainer(FakeWorker, self.fake_module)

        subject.worker_instance.start = Mock()
        time.time = lambda: 59
        subject.check()

        self.assertFalse(subject.worker_instance.start.called)

        time.time = real_time

    def test_worker_check_start(self):
        real_time = time.time
        time.time = lambda: 0

        subject = PredictionWorkerContainer(FakeWorker, self.fake_module)

        subject.worker_instance.start = Mock()
        time.time = lambda: 61
        subject.check()

        self.assertEquals(1, subject.worker_instance.start.call_count)

        time.time = real_time

    def test_worker_check_stop(self):
        real_time = time.time
        time.time = lambda: 0

        subject = PredictionWorkerContainer(FakeWorker, self.fake_module)

        time.time = lambda: 100
        subject.is_running = True
        subject.worker_instance.last_execution_time = Value('d', 100)
        subject.start_time = 0
        initial_worker = subject.worker_instance

        subject.check()

        self.assertFalse(subject.is_running)
        self.assertIsNot(initial_worker, subject.worker_instance)
        self.assertIsInstance(subject.worker_instance, FakeWorker)
        self.assertEquals(160, subject.next_run_time)

        time.time = real_time

    def test_worker_check_running(self):
        real_time = time.time
        time.time = lambda: 0

        subject = PredictionWorkerContainer(FakeWorker, self.fake_module)

        time.time = lambda: 100
        subject.is_running = True
        subject.worker_instance.is_alive = Mock(return_value=True)
        subject.worker_instance.start = Mock()
        initial_worker = subject.worker_instance
        initial_run_time = subject.next_run_time
        subject.check()

        self.assertTrue(subject.is_running)
        self.assertIs(initial_worker, subject.worker_instance)
        self.assertEquals(initial_run_time, subject.next_run_time)
        self.assertFalse(subject.worker_instance.start.called)

        time.time = real_time