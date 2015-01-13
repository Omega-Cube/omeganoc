#!/usr/bin/env python
#Copyright (C) 2010-2012 Omega Cube
#  Xavier Roger-Machart, xrm@omegacube.fr
#
# This file is part of Omega Noc

""" Unit tests for the user controller """ 

from omeganoc_tests.basetestclass import OmegaNocTestCase
from omeganoc import db
from omeganoc.user import User

class UserTestCase(OmegaNocTestCase):
    def test_check_password(self):
        user = User('login', 'pass', False)
        self.assertTrue(user.check_password('pass'))

    def test_check_wrong_password(self):
        user = User('login', 'pass', False)
        self.assertFalse(user.check_password('nope'))
        self.assertFalse(user.check_password(''))

    def login(self, username, password):
        return self.app.post('/login', data=dict(
             username=username, password=password), 
             follow_redirects = True)

    def test_check_login(self):
        # Send the POST request
        result = self.login('admin', 'admin')
        self.assertIn('<div id="user-menu">', result.data)

    def test_check_wrong_login(self):
        result = self.login('adminx', 'admin') 
        self.assertIn('Invalid username or password', result.data)
        result = self.login('admin', 'adminx') 
        self.assertIn('Invalid username or password', result.data)
        result = self.login('', 'admin')
        self.assertIn('Username should contain between 4 and 20 characters', result.data)
        result = self.login('admin', '')
        self.assertIn('Password is required', result.data)
        result = self.login('', '')
        self.assertIn('Username should contain between 4 and 20 characters', result.data)
        self.assertIn('Password is required', result.data)

    def edit_new(self, username, password,confirm_password,is_super_admin, is_disabled):
        return self.app.post('/edit-user', data=dict(
             username = username, password = password, confirm_password = confirm_password, is_super_admin = is_super_admin, is_disabled = is_disabled ), 
             follow_redirects = True)

    def test_check_edit_new_user(self):
        self.login('admin', 'admin')
        result = self.edit_new('user1', 'user', 'user', True, True) 
        user = User.query.filter_by(username = 'user1').first()
        self.assertTrue(user.username == 'user1')
        self.assertTrue(user.check_password('user'))
        self.assertTrue(user.is_super_admin)
        self.assertTrue(user.is_disabled)
        
    def test_check_wrong_edit_new_user(self):
        self.login('admin', 'admin')
        result = self.edit_new('', 'admin', 'admin', False, False)
        self.assertIn('Username should contain between 4 and 20 characters', result.data)
        result = self.edit_new('us', 'user', 'user', False, False)
        self.assertIn('Username should contain between 4 and 20 characters', result.data)
        result = self.edit_new('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'admin', 'admin' , 'False', 'False')
        self.assertIn('Username should contain between 4 and 20 characters', result.data)
        result = self.edit_new('user', 'userx', 'user', False, False)
        self.assertIn('Passwords must match', result.data)
        result = self.edit_new('user', 'user', 'userx', False, False)
        self.assertIn('Passwords must match', result.data)
        result = self.edit_new('user', '', 'user', False, False)
        self.assertIn('Passwords must match', result.data)
        result = self.edit_new('user', 'user', '', False, False)
        self.assertIn('Passwords must match', result.data)
        result = self.edit_new('user', '', '', False, False)
        self.assertIn('Password is required', result.data)

    def edit_user(self, username, password,confirm_password,is_super_admin, is_disabled):
        return self.app.post('/edit-user/1', data=dict(
             username = username, password = password, confirm_password = confirm_password, is_super_admin = is_super_admin, is_disabled = is_disabled ), 
             follow_redirects = True)

    def test_check_edit_user(self):
        self.login('admin', 'admin')
        result = self.edit_user('admin', '', '', '', '')
        user = User.query.filter_by(username = 'admin').first()
        self.assertTrue(user.username == 'admin')
        self.assertTrue(user.check_password('admin'))
        result = self.edit_user('admin', 'user', 'user', '', '')
        user = User.query.filter_by(username = 'admin').first()
        self.assertTrue(user.check_password('user'))
        result = self.edit_user('admin', '', '', '', 'True')
        user = User.query.filter_by(username = 'admin').first()
        self.assertTrue(user.is_disabled)
        # if user change username
        result = self.edit_user('user', '', '', '', '')
        user = User.query.get(1)
        self.assertTrue(user.username == 'user')

    def test_check_wrong_edit_user(self):
        self.login('admin', 'admin')
        result = self.edit_user('', '', '', '', '')
        self.assertIn('Username should contain between 4 and 20 characters', result.data)
        result = self.edit_user('ad', '', '', '', '')
        self.assertIn('Username should contain between 4 and 20 characters', result.data)
        result = self.edit_user('aaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '', '', '', '')
        self.assertIn('Username should contain between 4 and 20 characters', result.data)
        result = self.edit_user('admin', 'user', '', '', '')
        self.assertIn('Passwords must match', result.data)
        result = self.edit_user('admin', '', 'user', '', '')
        self.assertIn('Passwords must match', result.data)
        result = self.edit_user('admin', 'user', 'userx', '', '')
        self.assertIn('Passwords must match', result.data)
        result = self.edit_user('admin', 'userx', 'user', '', '')
        self.assertIn('Passwords must match', result.data)
