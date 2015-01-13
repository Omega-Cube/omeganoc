#!/usr/bin/env python
#Copyright (C) 2014 Omega Cube
#
# This file is part of Omega Noc

""" Omega Noc on_reader package
 * Monitored system structure (get a list of hosts, services, and the
   relationships between them)
 * Metrologic data (for example, used CPU load of a host, requests/s received
   by an SQL service, ...)
 * Triggered events (an event raised when something happens, for example a
   host goes down or goes back up)
 * Past events (access the history of all previously triggered events)
"""
import sys

# MetroLogic

class MetroLogic(object):
    def eval_qs(self, query_string):
        from graphite.query import eval_qs
        return eval_qs(query_string)

    def query(self, params):
        from graphite.query import query
        return query(params)


metrologic = MetroLogic()
