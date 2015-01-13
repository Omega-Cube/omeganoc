#!/usr/bin/env python
#Copyright (C) 2010-2012 Omega Cube
#  Xavier Roger-Machrt
#
# This file is part of Omega Noc

""" Omega Noc's web interface unit tests package """ 

import unittest

def get_all_tests():
    """ Gets a list of all the tests of the suite """
    return unittest.TestLoader().discover('omeganoc_tests')
