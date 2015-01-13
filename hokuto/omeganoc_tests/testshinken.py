#!/usr/bin/env python
#Copyright (C) 2010-2012 Omega Cube
#  Xavier Roger-Machart, xrm@omegacube.fr
#
# This file is part of Omega Noc

""" Unit tests for the shinken_helper module """ 

import sys

from omeganoc_tests.basetestclass import OmegaNocTestCase
from omeganoc import db
from omeganoc.user import User
from shinken.objects.config import Config

class ShinkenTestCase(OmegaNocTestCase):

    def login(self, username, password):
        return self.app.post('/login', data=dict(
             username=username, password=password), 
             follow_redirects = True)

    def logout(self):
        return self.app.get('/logout', follow_redirects = True)

             
