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
/* global jasmine describe it expect spyOn fail beforeEach */

define(['logs.manager', 'metroservice', 'timeframecache', 'onoc.config'], function(LogsManager, MetroService, TimeFrameCache, Config) {
    describe('The Logs Manager', function() {
        it('reads values from the time frame cache', function() {
            spyOn(TimeFrameCache.prototype, 'get').and.returnValue({
                then: function(cb) {
                    return cb({
                        'myHost|myService': [
                            { time: 600 }
                        ],
                        'myOtherHost|myOtherService': [
                            { time: 700 }
                        ]
                    });
                },
            });
            spyOn(Config, 'separator').and.returnValue('|');

            var manager = new LogsManager(null);

            var result = manager.get([['myHost', 'myService'], ['myOtherHost', 'myOtherService']], 500, 1000);

            expect(result).toEqual({
                myHost: {
                    myService: [
                        { time: 600 }
                    ]
                },
                myOtherHost: {
                    myOtherService: [
                        { time: 700 }
                    ]
                },
            });
            expect(TimeFrameCache.prototype.get).toHaveBeenCalledWith(['myHost|myService', 'myOtherHost|myOtherService'], 500, 1000);
        });

        it('downloads data from the metro service', function() {
            var thenCallback = null;
            spyOn(MetroService, 'getLogs').and.returnValue({
                then: function(callback) {
                    thenCallback = callback;
                    return 'ok';
                }
            });
            spyOn(Config, 'separator').and.returnValue('|');

            var result = LogsManager._logDownloader([
                ['myHost|myService', 42, 52],
                ['myHost|myOtherService', 43, 53],
            ]);

            expect(result).toBe('ok');
            expect(thenCallback).not.toBeNull();
            expect(MetroService.getLogs).toHaveBeenCalledWith([
                ['myHost', 'myService', 42, 52],
                ['myHost', 'myOtherService', 43, 53],
            ]);

            // Check that the result is correctly transformed
            var transformResult = thenCallback({
                myHost: {
                    myService: [
                        { state: 'OK' },
                        { state: 'WARNING' },
                    ],
                    myOtherService: [
                        { state: 'CRITICAL' },
                    ],
                }
            });

            expect(transformResult).toEqual({
                'myHost|myService': [
                    { state: 'OK', state_num: 0 },
                    { state: 'WARNING', state_num: 1 },
                ],
                'myHost|myOtherService': [
                    { state: 'CRITICAL', state_num: 2 },
                ],
            });
        });
    });
});