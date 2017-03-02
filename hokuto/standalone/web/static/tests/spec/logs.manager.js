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
/* global describe it expect spyOn fail */

define(['libs/rsvp', 'logs.manager'], function(RSVP, LogsManager) {
    describe('The Logs Manager', function() {
        describe('cache presence detection (_downloadRequired)', function() {
            it('works for elements that are not in the cache yet', function() {
                var manager = new LogsManager();
                var result = manager._downloadRequired('myhost', 'myservice', 10, 100);

                expect(result).toEqual([[10, 100]]);
            });

            it('works for elements that are later in the cache, but not intersecting', function() {
                var manager = new LogsManager();
                manager.cache.myhost = {};
                manager.cache.myhost.myservice = [{
                    start: 1000,
                    end: 1001,
                    entries: [],
                }];
                var result = manager._downloadRequired('myhost', 'myservice', 10, 100);

                expect(result).toEqual([[10, 100]]);
            });

            it('works for elements that are earlier in the cache, but not intersecting', function() {
                var manager = new LogsManager();
                manager.cache.myhost = {};
                manager.cache.myhost.myservice = [{
                    start: 5,
                    end: 8,
                    entries: [],
                }];
                var result = manager._downloadRequired('myhost', 'myservice', 10, 100);

                expect(result).toEqual([[10, 100]]);
            });

            it('works for elements that are later in the cache, and intersecting', function() {
                var manager = new LogsManager();
                manager.cache.myhost = {};
                manager.cache.myhost.myservice = [{
                    start: 5,
                    end: 8,
                    entries: [],
                }, {
                    start: 90,
                    end: 200,
                    entries: [],
                }];
                var result = manager._downloadRequired('myhost', 'myservice', 10, 100);

                expect(result).toEqual([[10, 90]]);
            });

            it('works for elements that are earlier in the cache, and intersecting', function() {
                var manager = new LogsManager();
                manager.cache.myhost = {};
                manager.cache.myhost.myservice = [{
                    start: 5,
                    end: 12,
                    entries: [],
                }, {
                    start: 110,
                    end: 200,
                    entries: [],
                }];
                var result = manager._downloadRequired('myhost', 'myservice', 10, 100);

                expect(result).toEqual([[12, 100]]);
            });

            it('works for elements that are intersecting with two elements, one earlier and one later', function() {
                var manager = new LogsManager();
                manager.cache.myhost = {};
                manager.cache.myhost.myservice = [{
                    start: 5,
                    end: 12,
                    entries: [],
                }, {
                    start: 80,
                    end: 200,
                    entries: [],
                }];
                var result = manager._downloadRequired('myhost', 'myservice', 10, 100);

                expect(result).toEqual([[12, 80]]);
            });

            it('works for elements that are already entirely cached', function() {
                var manager = new LogsManager();
                manager.cache.myhost = {};
                manager.cache.myhost.myservice = [{
                    start: 5,
                    end: 120,
                    entries: [],
                }];
                var result = manager._downloadRequired('myhost', 'myservice', 10, 100);

                expect(result).toBeNull();
            });

            it('works for elements that are intersecting in the middle', function() {
                var manager = new LogsManager();
                manager.cache.myhost = {};
                manager.cache.myhost.myservice = [{
                    start: 40,
                    end: 66,
                    entries: [],
                }, {
                    start: 110,
                    end: 200,
                    entries: [],
                }];
                var result = manager._downloadRequired('myhost', 'myservice', 10, 100);

                expect(result).toEqual([[10, 40], [66, 100]]);
            });

            it('works for elements that are intersecting in the middle and at the end', function() {
                var manager = new LogsManager();
                manager.cache.myhost = {};
                manager.cache.myhost.myservice = [{
                    start: 40,
                    end: 66,
                    entries: [],
                }, {
                    start: 88,
                    end: 101,
                    entries: [],
                }];
                var result = manager._downloadRequired('myhost', 'myservice', 10, 100);

                expect(result).toEqual([[10, 40], [66, 88]]);
            });

        });

        describe('cache entries merging (_mergeDataSets)', function() {
            it('correctly inserts values from one set to the other', function() {
                var data1 = [
                    { time: 10 },
                    { time: 15 },
                    { time: 16 },
                    { time: 22 },
                    { time: 25 },
                ];
                var data2 = [
                    { time: 2 },
                    { time: 14 },
                    { time: 20 },
                    { time: 35 },                    
                ];

                LogsManager._mergeDataSets(data1, data2);

                expect(data1).toEqual([
                    { time: 2 },
                    { time: 10 },
                    { time: 14 },
                    { time: 15 },
                    { time: 16 },
                    { time: 20 },
                    { time: 22 },
                    { time: 25 },
                    { time: 35 },
                ]);
            });

            it('works when inserting data in an empty set', function() {
                var data1 = [];
                var data2 = [
                    { time: 2 },
                    { time: 14 },
                    { time: 20 },
                    { time: 35 },                    
                ];

                LogsManager._mergeDataSets(data1, data2);

                expect(data1).toEqual([
                    { time: 2 },
                    { time: 14 },
                    { time: 20 },
                    { time: 35 },                    
                ]);
            });

            it('works when inserting an empty set in existing data', function() {
                var data1 = [
                    { time: 10 },
                    { time: 15 },
                    { time: 16 },
                    { time: 22 },
                    { time: 25 },
                ];
                var data2 = [];

                LogsManager._mergeDataSets(data1, data2);

                expect(data1).toEqual([
                    { time: 10 },
                    { time: 15 },
                    { time: 16 },
                    { time: 22 },
                    { time: 25 },
                ]);
            });
        });

        describe('automatic cache merging (_mergeInCache)', function() {
            it('merges new data with a non-intersecting, but touching section (with no gap between the two)', function() {
                var manager = new LogsManager();

                manager.cache.myhost = {};
                manager.cache.myhost.myservice = [
                    {
                        start: 100,
                        end: 200,
                        entries: [],
                    },
                    {
                        start: 500,
                        end: 550,
                        entries: [],
                    },
                ];

                manager._mergeInCache('myhost', 'myservice', 200, 250, []);

                expect(manager.cache).toEqual({
                    myhost: {
                        myservice: [
                            {
                                start: 100,
                                end: 250,
                                entries: [],
                            },
                            {
                                start: 500,
                                end: 550,
                                entries: [],
                            },
                        ]
                    }
                });
            });

            it('merges new data with several intersecting sections', function() {
                var manager = new LogsManager();

                manager.cache.myhost = {};
                manager.cache.myhost.myservice = [
                    {
                        start: 100,
                        end: 200,
                        entries: [],
                    },
                    {
                        start: 500,
                        end: 550,
                        entries: [],
                    },
                ];

                manager._mergeInCache('myhost', 'myservice', 50, 510, [{time: 300}]);

                expect(manager.cache).toEqual({
                    myhost: {
                        myservice: [
                            {
                                start: 50,
                                end: 550,
                                entries: [{time: 300}],
                            },
                        ]
                    }
                });
            });

        });

        describe('cache reading (_getFromCache)', function() {
            it('works', function() {
                var manager = new LogsManager();
                manager.cache.blub = {};
                manager.cache.blub.myservice = [
                    {
                        start: 200,
                        end: 500,
                        entries: [
                            { time: 210 },
                            { time: 250 },
                            { time: 360 },
                            { time: 470 },
                        ],
                    },
                ];

                manager.cache.flub = {};
                manager.cache.flub.myservice = [
                    {
                        start: 250,
                        end: 550,
                        entries: [
                            { time: 290 },
                            { time: 350 },
                            { time: 500 },
                        ],
                    },
                ];

                var result = manager._getFromCache([['flub', 'myservice'], ['blub', 'myservice']], 250, 500);

                expect(result).toEqual({
                    blub: {
                        myservice: [
                            { time: 250 },
                            { time: 360 },
                            { time: 470 },
                        ]
                    },
                    flub: {
                        myservice: [
                            { time: 290 },
                            { time: 350 },
                        ]
                    }
                });
            });
        });

        describe('content retrieval', function() {
            it('works when all the data is already in the cache', function(done) {
                spyOn(LogsManager.prototype, '_downloadRequired').and.returnValues(null, null);
                spyOn(LogsManager.prototype, '_downloadAndUpdateCache');
                spyOn(LogsManager.prototype, '_getFromCache').and.returnValues('ok');
                var manager = new LogsManager();

                var hostAndServiceNames = [['flub', 'myservice'], ['glub', 'myservice']];
                var promise = manager.get(hostAndServiceNames, 100, 200);

                promise.then(function(result) {
                    expect(result).toBe('ok');
                    // Make sure no download was requested
                    expect(LogsManager.prototype._downloadRequired).toHaveBeenCalledTimes(2);
                    expect(LogsManager.prototype._downloadAndUpdateCache).toHaveBeenCalledTimes(0);
                    expect(LogsManager.prototype._getFromCache).toHaveBeenCalledWith(hostAndServiceNames, 100, 200);
                }).catch(function() {
                    fail('The promise failed!');
                }).finally(function() {
                    done();
                });
            });

            it('works when some data needs downloading', function(done) {
                spyOn(LogsManager.prototype, '_downloadRequired').and.returnValues(null, [[100, 120], [150, 200]]);
                spyOn(LogsManager.prototype, '_downloadAndUpdateCache').and.returnValues(new RSVP.Promise(function(resolve) {
                    resolve();
                }));
                spyOn(LogsManager.prototype, '_getFromCache').and.returnValues('ok');
                var manager = new LogsManager();

                var hostAndServiceNames = [['flub', 'myservice'], ['glub', 'myservice']];
                var promise = manager.get(hostAndServiceNames, 100.2, 199.5);

                promise.then(function(result) {
                    expect(result).toBe('ok');

                    expect(LogsManager.prototype._downloadRequired).toHaveBeenCalledTimes(2);
                    expect(LogsManager.prototype._downloadAndUpdateCache).toHaveBeenCalledWith([['glub', 'myservice', 100, 120], ['glub', 'myservice', 150, 200]], 100, 200);
                    expect(LogsManager.prototype._getFromCache).toHaveBeenCalledWith(hostAndServiceNames, 100, 200);
                }).catch(function() {
                    fail('The promise failed!');
                }).finally(function() {
                    done();
                });
            });
        });
    });
});
