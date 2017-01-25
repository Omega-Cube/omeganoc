#!python

# -*- coding: utf-8 -*-

# This file is part of Omega Noc
# Copyright Omega Noc (C) 2017 Omega Cube and contributors
# Xavier Roger-Machart, xrm@omegacube.fr
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

""" Nagios check that execute Nanto predictions """

import argparse
import ConfigParser
import importlib
import logging

import nagiosplugin

CONF_FILE_PATH = '/etc/nanto.cfg'

class NantoResource(nagiosplugin.Resource):
    """
    A wrapper that turns a prediction worker into a nagiosplugin resource
    """
    def __init__(self, worker_name, hostname, servicename, data_length, influx_info):
        super(NantoResource, self).__init__()
        self.worker_type = load_worker(worker_name)
        self.hostname = hostname
        self.servicename = servicename
        self.worker_name = worker_name
        self.influx_info = influx_info
        self.data_length = data_length

    def probe(self):
        logging.debug('Running prediction on %s/%s', self.hostname, self.servicename)
        worker_inst = self.worker_type()
        worker_inst.initialize(self.influx_info)
        return nagiosplugin.Metric(
            '{} prediction'.format(self.worker_name), worker_inst.run(
                self.hostname,
                self.servicename,
                300000,
                self.data_length),
            min=0,
            uom='s')

def load_worker(worker_name):
    """
    Locates and returns a prediction worker class
    """
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

def load_config():
    """
    Loads the configuration required by the prediction operations
    """
    conf = ConfigParser.SafeConfigParser()
    readlist = conf.read(CONF_FILE_PATH)
    if len(readlist) != 1:
        logging.critical('Could not read the configuration file (%s)', CONF_FILE_PATH)
        return None
    try:
        confitems = conf.items('nanto')
    except ConfigParser.NoSectionError as ex:
        logging.critical('The configuration file does not contain a Nanto section')
        return None
    confdict = {key: value for key, value in confitems}
    return {
        'host': confdict.get('influx_host', None),
        'port': confdict.get('influx_port', None),
        'database': confdict.get('influx_database', None),
        'username': confdict.get('influx_username', None),
        'password': confdict.get('influx_password', None)
    }

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
    argp.add_argument('-d', '--datalength', type=int, default=0,
                      help='The amount of data that should be used as the prediction input, in days.')
    argp.add_argument('-S', '--service', help='Name of the service you want the data for')
    args = argp.parse_args()

    conf = load_config()

    check = nagiosplugin.Check(
        NantoResource(args.worker, args.hostname, args.service, args.datalength, conf),
        nagiosplugin.ScalarContext(args.worker + ' prediction', args.warning, args.critical))
    check.main()

if __name__ == '__main__':
    main()
