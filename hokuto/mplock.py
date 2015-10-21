import os
import fcntl

class FLock(object):
    """ Creates a cross-process lock using a specified file """
    def __init__(self, filename):
        """ Creates a new lock using the specified file """
        self.filename = filename
        # This will contain the file handle after the first use
        self.handle = None
        
    def acquire(self):
        """ Acquires the lock, blocking if it's been already locked by another process """
        if self.handle is None:
            self.handle = open(self.filename, 'w')
        fcntl.flock(self.handle, fcntl.LOCK_EX)
        
    def release(self):
        """ Releases the lock """
        fcntl.flock(self.handle, fcntl.LOCK_UN)
        
    def __del__(self):
        if self.handle is not None:
            self.handle.close()
        
class FLockManager(object):
    """ Provides a context manager that acquires the specified lock on entry, and releases it on exit """
    def __init__(self, flock):
        self.lock = flock
    
    def __enter__(self):
        self.lock.acquire()
        return self
        
    def __exit__(self, type, value, tb):
        self.lock.release()
        
monitor_lock = FLock('/tmp/bond_monitor.lock')