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
/* global describe it expect beforeEach */

define(['onoc.createurl', 'onoc.config'], function(createUrl, Config) {
    describe('The createUrl function', function() {
        beforeEach(function() {
            Config.setValues('http://localhost/', ';', false, 'contact');
        });

        it('generates URLs from segments not starting with a slash', function() {
            var result = createUrl('test');

            expect(result).toBe('http://localhost/test');
        });

        it('generates URLs from segments starting with a slash', function() {
            var result = createUrl('/test');

            expect(result).toBe('http://localhost/test');
        });
    });
});