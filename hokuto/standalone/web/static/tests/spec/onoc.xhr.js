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
/* global describe it expect jasmine */

define(['onoc.xhr'], function(OnocXHR) {
    describe('The ONOC requests library', function() {
        describe('Data string generation', function() {
            it('correctly handles empty arguments list', function() {
                var resultFromNull = OnocXHR._createDataString(null);
                var resultFromEmpty = OnocXHR._createDataString({});
                expect(resultFromNull).toBeNull();
                expect(resultFromEmpty).toBeNull();
            });

            it('correctly encodes special characters', function() {
                var result = OnocXHR._createDataString({
                    'omelette du fromâge': 'memes & lol',
                    'wut/wat': '1+2'
                });

                expect(result).toBe('omelette+du+from%C3%A2ge=memes+%26+lol&wut%2Fwat=1%2B2');
            });

            it('can handle duplicate keys', function() {
                var result = OnocXHR._createDataString({
                    'myKey': [
                        'value1',
                        'value2'
                    ]
                });

                expect(result).toBe('myKey=value1&myKey=value2');
            });
        });

        describe('can handle JSON results', function() {
            it('understand successful responses', function() {
                var xhr = {
                    status: 200,
                    response: '{"someKey":"someValue","test":5}',
                };

                var resolveSpy = jasmine.createSpy();
                var rejectSpy = jasmine.createSpy();
                OnocXHR._handleJsonResponse(xhr, resolveSpy, rejectSpy);
                expect(rejectSpy).toHaveBeenCalledTimes(0);
                expect(resolveSpy).toHaveBeenCalledWith({someKey:'someValue', test:5});
            });

            it('JSON requests handling', function() {
                var xhr = {
                    status: 403,
                    response: 'Pls don\'t...',
                };

                var resolveSpy = jasmine.createSpy();
                var rejectSpy = jasmine.createSpy();

                OnocXHR._handleJsonResponse(xhr, resolveSpy, rejectSpy);

                expect(resolveSpy).toHaveBeenCalledTimes(0);
                expect(rejectSpy).toHaveBeenCalledWith(xhr);                
            });

            it('can handle invalid json data', function() {
                var xhr = {
                    status: 403,
                    response: 'stop right there!',
                };

                var resolveSpy = jasmine.createSpy();
                var rejectSpy = jasmine.createSpy();

                OnocXHR._handleJsonResponse(xhr, resolveSpy, rejectSpy);

                expect(resolveSpy).toHaveBeenCalledTimes(0);
                expect(rejectSpy).toHaveBeenCalledWith(xhr);                
            });

        });

        describe('empty requests handling', function() {
            it('reacts to success responses', function() {
                var xhr = {
                    status: 200,
                };

                var resolveSpy = jasmine.createSpy();
                var rejectSpy = jasmine.createSpy();

                OnocXHR._handleEmptyResponse(xhr, resolveSpy, rejectSpy);

                expect(rejectSpy).toHaveBeenCalledTimes(0);
                expect(resolveSpy).toHaveBeenCalledWith(null);
            });

            it('reacts to error responses', function() {
                var xhr = {
                    status: 404,
                };

                var resolveSpy = jasmine.createSpy();
                var rejectSpy = jasmine.createSpy();

                OnocXHR._handleEmptyResponse(xhr, resolveSpy, rejectSpy);

                expect(resolveSpy).toHaveBeenCalledTimes(0);
                expect(rejectSpy).toHaveBeenCalledWith(xhr);
            });
        });
    }); 
});