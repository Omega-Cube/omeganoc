#!/usr/bin/env python
#Copyright (C) 2010-2012 Omega Cube
#  Xavier Roger-Machart
#
# This file is part of Omega Noc

""" Unit testing base class """ 


import os
import unittest

import install
import omeganoc_tests

from omeganoc import app, db
from omeganoc.user import User

class OmegaNocTestCase(unittest.TestCase):
    """ Base class for all unit tests """
    def setUp(self):
        """ Sets up the unit test
        This method loads the Flask engine and invokes the database
        initialization script (see create_db)
        """
        app.config.from_pyfile(os.path.join(omeganoc_tests.__path__[0], 'test-config.cfg'))
        app.config['TESTING'] = True
        self.app = app.test_client()
        self.create_db()


    def tearDown(self):
        """ Cleans up resources used by a test """
        db.session.remove()
        db.drop_all()        
        pass

    def create_db(self):
        """ Prepares the database so it it ready for testing """
        # We start by dropping everything to avoid duplicates when previous 
        # test didn't go well and couldn't tear down
        db.drop_all()
        # And create
        db.create_all()
        user = User('admin', 'admin', True)
        db.session.add(user)
        db.session.commit()
