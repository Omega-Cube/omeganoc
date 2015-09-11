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
    def __init__(self, host, service, probes, ctime = None):
        self.host = host
        self.service = service
        self.probes = probes
        if ctime is None:
            self.ctime = time.time()
        else:
            self.ctime = ctime

    def generate_seed(self, probe_name):
        return abs(hash(self.host + '-:-' + self.service + '-::-' + probe_name)) % 2000
        
    def probe(self):
        return [nagiosplugin.Metric(pname, pvalue, min=pmin) for pname, pvalue, pmin, pmax in self.values()]
        
    def values(self):
        for pname, warn, crit, pmin, pmax in self.probes:
            mid_range = (pmax - pmin) / 2
            seed = self.generate_seed(pname)
            index = self.ctime / 60 / 10080 + seed
            value = noise.pnoise1(index, octaves=5)
            #print 'Raw value: ' + str(value)
            yield (pname, value * mid_range + mid_range - pmin, pmin, pmax)
        
    @staticmethod
    def parse_probespec(spec):
        parts = spec.split(':')
        name = parts[0]
        warn = float(parts[1])
        crit = float(parts[2])
        min = 0
        max = 100
        if len(parts) > 3:
            min = float(parts[3])
        if len(parts) > 4:
            max = float(parts[4])
        return (name, warn, crit, min, max)

@nagiosplugin.guarded
def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('probes', nargs='+', help='A set of probes that should be returned by the tool. Each probe specification should look like: <name>:<warn>:<crit>[:<min>[:<max>]]')
    #parser.add_argument('--warning', '-w', metavar='RANGE', default='', help='return warning if value is outside RANGE')
    #parser.add_argument('--critical', '-c', metavar='RANGE', default='', help='return critical if load is outside RANGE')
    parser.add_argument('--verbose', '-v', action='count', default=0, help='increase output verbosity (used up to 3 times)')
    parser.add_argument('--host', '-H', help='An identifier for the host being measured')
    parser.add_argument('--service', '-S', default='HOST', help='An identifier for the service being measured')
    parser.add_argument('--time', '-t', type=float, help='Use this if you want to generate the random value for another time than the current time. This value should be a timestamp (float).')
    args = parser.parse_args()
    
    probes = [PNoise.parse_probespec(p) for p in args.probes]
    checkargs = []
    checkargs.append(PNoise(args.host, args.service, probes, args.time))
    checkargs.extend([nagiosplugin.ScalarContext(pname, pwarn, pcrit) for pname, pwarn, pcrit, mpin, pmax in probes]) #UNDONE
    checkargs.append(nagiosplugin.Summary())
    
    check = nagiosplugin.Check(*checkargs)
    check.main(verbose=args.verbose)

if __name__ == '__main__':
    run()
