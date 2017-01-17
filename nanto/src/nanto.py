#!python

""" Nagios check that execute Nanto predictions """

import argparse
import importlib
import logging

import nagiosplugin

class NantoResource(nagiosplugin.Resource):
    def __init__(self, worker_name, hostname, servicename):
        super(NantoResource, self).__init__()
        self.worker_type = load_worker(worker_name)
        self.hostname = hostname
        self.servicename = servicename
        self.worker_name = worker_name

    def probe(self):
        logging.debug('Running prediction on %s/%s', self.hostname, self.servicename)
        worker_inst = self.worker_type()
        return nagiosplugin.Metric('{} prediction'.format(self.worker_name), worker_inst.run(self.hostname, self.servicename, 300000), min=0, uom='s')

def load_worker(worker_name):
    modulename = worker_name.lower() + '_worker'
    try:
        mod = importlib.import_module(modulename)
    except Exception as err:
        logging.warning('[nanto] Could not load worker module {0} because: {1}'.format(modulename, err))
        return None
    typename = worker_name + 'Worker'
    try:
        worker_type = getattr(mod, typename)
    except AttributeError:
        logging.warning('[nanto] Could not find the worker class {0} in the module {1}'.format(typename, modulename))
        return None
    logging.debug('[nanto] Loaded worker %s', worker_name)
    return worker_type


def main():
    # TODO: Add the possibility to pass in other custom arguments, 
    # for example the "from" state for the state transition previsions

    logging.basicConfig(filename='nanto.log',
                        filemode='a',
                        format='%(asctime)s,%(msecs)d %(name)s %(levelname)s %(message)s',
                        datefmt='%H:%M:%S',
                        level=logging.DEBUG)

    argp = argparse.ArgumentParser(description=__doc__)
    argp.add_argument('-w', '--warning', metavar='RANGE', default='',
                      help='return warning if load is outside RANGE')
    argp.add_argument('-c', '--critical', metavar='RANGE', default='',
                      help='return critical if load is outside RANGE')
    argp.add_argument('-W', '--worker', required=True,
                      help='The name of the algorithm that should be executed on the specified probe')
    argp.add_argument('-H', '--hostname', required=True,
                      help='The target hostname')
    argp.add_argument('-S', '--service', help='Name of the service you want the data for')
    args = argp.parse_args()
    check = nagiosplugin.Check(
        NantoResource(args.worker, args.hostname, args.service),
        nagiosplugin.ScalarContext(args.worker + ' prediction', args.warning, args.critical))
    check.main()

if __name__ == '__main__':
    main()
