/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2016 Omega Cube and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
'use strict';

// Jasmine globals
/* global describe it expect beforeEach afterEach jasmine */

/* eslint-disable no-console,no-global-assign */

define(['console'], function(Console) {
    describe('The console utility', function() {
        var fakeConsole = null;
        var originalConsole = null;

        beforeEach(function() {
            fakeConsole = jasmine.createSpyObj('console', ['log', 'info', 'warn', 'error']);
            originalConsole = console;
            console = fakeConsole;
        });

        afterEach(function() {
            console = originalConsole;
            fakeConsole = null;
        });

        it('sends log messages', function() {
            Console.log('message');

            expect(console.log).toHaveBeenCalledWith('message');
        });

        it('sends info messages', function() {
            Console.info('another message');

            expect(console.info).toHaveBeenCalledWith('another message');
        });

        it('sends warning messages', function() {
            Console.warn('achtung!');

            expect(console.warn).toHaveBeenCalledWith('achtung!');
        });

        it('sends error messages', function() {
            Console.error('oh no!');

            expect(console.error).toHaveBeenCalledWith('oh no!');
        });
    });
});