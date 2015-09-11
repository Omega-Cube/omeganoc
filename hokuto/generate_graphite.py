#!/usr/bin/env python

"""
A tool that generates a graphite archive with past data
filled with random values
"""

import argparse
import logging
import os
import time
import whisper

from check_random import PNoise

storage_root = '/opt/graphite/storage/whisper/'

def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('host', help='Host name (graphite name level 1)')
    parser.add_argument('service', help='Service name (graphite name level 2)')
    parser.add_argument('probe', help='Probe name (graphite name level 1)')
    parser.add_argument('--duration', '-d', type=int, default=60*60*24*365, help='The amount of seconds of data that should be put into the archive')
    parser.add_argument('--min', default=0, help='lower bound of the random value')
    parser.add_argument('--max', default=100, help='upper bound of the random value')
    args = parser.parse_args()
    point_interval = 60 # Generate 1 data point every 5 mins
    
    # Create the archive
    path = generate_path(args.host, args.service, args.probe)
    if os.path.exists(path):
        logging.info('Overwriting destination file')
        os.unlink(path)
    archive_list = [whisper.parseRetentionDef('1m:30d'),
                    whisper.parseRetentionDef('5m:365d')]
    whisper.create(path, archive_list, xFilesFactor=0.0, aggregationMethod='average')
    
    # Fill the archive with data
    now = time.time()
    t = now - args.duration
    t = t + (t % point_interval) # Make sure that we get data points aligned with midnight
    rng = PNoise(args.host, args.service, [(args.probe, 0, 0, args.min, args.max)])
    while t < now:
        rng.ctime = t
        for pname, pvalue, pmin, pmax in rng.values():
            #print 'value for time {0} is {1}'.format(t, pvalue)
            whisper.update(path, pvalue, t)
        t += point_interval

def generate_path(host, service, probe):
    """ Ensures that the directory for a graphite archive exists """
    dir = os.path.join(storage_root, host)
    if not os.path.isdir(dir):
        os.mkdir(dir)
    dir = os.path.join(dir, service)
    if not os.path.isdir(dir):
        os.mkdir(dir)
    return os.path.join(dir, probe + '.wsp')

if __name__ == '__main__':
    run()
