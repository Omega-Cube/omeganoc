#!/usr/bin/env python

"""
A nagios command that generates perlin noise instead of data from an actual 
service. The generated perlin noise uses the hostname and service name to
use the same random seed for all individual hosts and services.
"""

import argparse
import sys
import time

import nagiosplugin
import noise

class PNoise(nagiosplugin.Resource):
    def __init__(self, minval, maxval, host, service):
        self.minval = minval
        self.maxval = maxval
        self.host = host
        self.service = service

    def generate_seed(self):
        return abs(hash(self.host + '-:-' + self.service)) % 2000
        
    def probe(self):
        mid_range = (self.maxval - self.minval) / 2
        seed = self.generate_seed()
        index = time.time() / 60 / 10080 + seed
        value = noise.pnoise1(index, octaves=5)
        #print 'Raw value: ' + str(value)
        value = value * mid_range + mid_range - self.minval
        #print 'Generated {0} for index {1}'.format(value, index)
        return nagiosplugin.Metric('value', value, min=self.minval)

@nagiosplugin.guarded
def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--warning', '-w', metavar='RANGE', default='', help='return warning if value is outside RANGE')
    parser.add_argument('--critical', '-c', metavar='RANGE', default='', help='return critical if load is outside RANGE')
    parser.add_argument('--verbose', '-v', action='count', default=0, help='increase output verbosity (used up to 3 times)')
    parser.add_argument('--min', default=0, help='lower bound of the random value')
    parser.add_argument('--max', default=100, help='upper bound of the random value')
    parser.add_argument('--host', '-H', help='An identifier for the host being measured')
    parser.add_argument('--service', '-S', default='NOSERVICE', help='An identifier for the service being measured')
    args = parser.parse_args()
    check = nagiosplugin.Check(
        PNoise(args.min, args.max, args.host, args.service),
        nagiosplugin.ScalarContext('value', args.warning, args.critical),
        nagiosplugin.Summary())
    check.main(verbose=args.verbose)

if __name__ == '__main__':
    run()
