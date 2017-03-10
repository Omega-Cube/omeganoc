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
/* global jasmine describe it expect spyOn fail */

define(['libs/rsvp', 'timeframecache', 'metroservice'], function(RSVP, TimeFrameCache) {
    describe('The Time frame Cache', function() {
        describe('cache presence detection (_downloadRequired)', function() {
            it('works for elements that are not in the cache yet', function() {
                var manager = new TimeFrameCache();
                var result = manager._downloadRequired('somekey', 10, 100);

                expect(result).toEqual([[10, 100]]);
            });

            it('works for elements that are later in the cache, but not intersecting', function() {
                var manager = new TimeFrameCache();
                manager.cache.somekey = [{
                    start: 1000,
                    end: 1001,
                    entries: [],
                }];
                var result = manager._downloadRequired('somekey', 10, 100);

                expect(result).toEqual([[10, 100]]);
            });

            it('works for elements that are earlier in the cache, but not intersecting', function() {
                var manager = new TimeFrameCache();
                manager.cache.somekey = [{
                    start: 5,
                    end: 8,
                    entries: [],
                }];
                var result = manager._downloadRequired('somekey', 10, 100);

                expect(result).toEqual([[10, 100]]);
            });

            it('works for elements that are later in the cache, and intersecting', function() {
                var manager = new TimeFrameCache();
                manager.cache.somekey = [{
                    start: 5,
                    end: 8,
                    entries: [],
                }, {
                    start: 90,
                    end: 200,
                    entries: [],
                }];
                var result = manager._downloadRequired('somekey', 10, 100);

                expect(result).toEqual([[10, 90]]);
            });

            it('works for elements that are earlier in the cache, and intersecting', function() {
                var manager = new TimeFrameCache();
                manager.cache.somekey = [{
                    start: 5,
                    end: 12,
                    entries: [],
                }, {
                    start: 110,
                    end: 200,
                    entries: [],
                }];
                var result = manager._downloadRequired('somekey', 10, 100);

                expect(result).toEqual([[12, 100]]);
            });

            it('works for elements that are intersecting with two elements, one earlier and one later', function() {
                var manager = new TimeFrameCache();
                manager.cache.somekey = [{
                    start: 5,
                    end: 12,
                    entries: [],
                }, {
                    start: 80,
                    end: 200,
                    entries: [],
                }];
                var result = manager._downloadRequired('somekey', 10, 100);

                expect(result).toEqual([[12, 80]]);
            });

            it('works for elements that are already entirely cached', function() {
                var manager = new TimeFrameCache();
                manager.cache.somekey = [{
                    start: 5,
                    end: 120,
                    entries: [],
                }];
                var result = manager._downloadRequired('somekey', 10, 100);

                expect(result).toBeNull();
            });

            it('works for elements that are intersecting in the middle', function() {
                var manager = new TimeFrameCache();
                manager.cache.somekey = [{
                    start: 40,
                    end: 66,
                    entries: [],
                }, {
                    start: 110,
                    end: 200,
                    entries: [],
                }];
                var result = manager._downloadRequired('somekey', 10, 100);

                expect(result).toEqual([[10, 40], [66, 100]]);
            });

            it('works for elements that are intersecting in the middle and at the end', function() {
                var manager = new TimeFrameCache();
                manager.cache.somekey = [{
                    start: 40,
                    end: 66,
                    entries: [],
                }, {
                    start: 88,
                    end: 101,
                    entries: [],
                }];
                var result = manager._downloadRequired('somekey', 10, 100);

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

                TimeFrameCache._mergeDataSets(data1, data2);

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

                TimeFrameCache._mergeDataSets(data1, data2);

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

                TimeFrameCache._mergeDataSets(data1, data2);

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
                var manager = new TimeFrameCache();

                manager.cache.somekey = [
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

                manager._mergeInCache('somekey', 200, 250, []);

                expect(manager.cache).toEqual({
                    somekey: [
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
                });
            });

            it('merges new data with several intersecting sections', function() {
                var manager = new TimeFrameCache();

                manager.cache.somekey = [
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

                manager._mergeInCache('somekey', 50, 510, [{time: 300}]);

                expect(manager.cache).toEqual({
                    somekey: [
                        {
                            start: 50,
                            end: 550,
                            entries: [{time: 300}],
                        },
                    ]
                });
            });

        });

        describe('cache reading (_getFromCache)', function() {
            it('works', function() {
                var manager = new TimeFrameCache();
                manager.cache.somekey = [
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

                manager.cache.someotherkey = [
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

                var result = manager._getFromCache(['somekey', 'someotherkey'], 250, 500);

                expect(result).toEqual({
                    somekey: [
                        { time: 250 },
                        { time: 360 },
                        { time: 470 },
                    ],
                    someotherkey: [
                        { time: 290 },
                        { time: 350 },
                    ],
                });
            });

            it('returns deep copies of the actual cache, preventing modifications from outside through returned values', function() {
                var tfc = new TimeFrameCache();
                tfc.cache.somekey = [
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

                var result = tfc._getFromCache(['somekey'], 250, 500);

                result.somekey[0].value = 'lul'; // Add a property in the result

                expect(tfc.cache.somekey[0].entries[1].value).toBeUndefined(); // The cache should not contain the new property
            });
        });

        describe('content retrieval', function() {
            it('works when all the data is already in the cache', function(done) {
                spyOn(TimeFrameCache.prototype, '_downloadRequired').and.returnValues(null, null);
                spyOn(TimeFrameCache.prototype, '_downloadAndUpdateCache');
                spyOn(TimeFrameCache.prototype, '_getFromCache').and.returnValue('ok');
                var manager = new TimeFrameCache();

                var keys = ['somekey', 'someotherkey'];
                var promise = manager.get(keys, 100, 200);

                promise.then(function(result) {
                    expect(result).toBe('ok');
                    // Make sure no download was requested
                    expect(TimeFrameCache.prototype._downloadRequired).toHaveBeenCalledTimes(2);
                    expect(TimeFrameCache.prototype._downloadAndUpdateCache).toHaveBeenCalledTimes(0);
                    expect(TimeFrameCache.prototype._getFromCache).toHaveBeenCalledWith(keys, 100, 200);
                }).catch(function() {
                    fail('The promise failed!');
                }).finally(function() {
                    done();
                });
            });

            it('works when some data needs downloading', function(done) {
                spyOn(TimeFrameCache.prototype, '_downloadRequired').and.returnValues(null, [[100, 120], [150, 200]]);
                spyOn(TimeFrameCache.prototype, '_downloadAndUpdateCache').and.returnValue(new RSVP.Promise(function(resolve) {
                    resolve();
                }));
                spyOn(TimeFrameCache.prototype, '_getFromCache').and.returnValue('ok');
                var manager = new TimeFrameCache();

                var keys = ['somekey', 'someotherkey'];
                var promise = manager.get(keys, 100.2, 199.5);

                promise.then(function(result) {
                    expect(result).toBe('ok');

                    expect(TimeFrameCache.prototype._downloadRequired).toHaveBeenCalledTimes(2);
                    expect(TimeFrameCache.prototype._downloadAndUpdateCache).toHaveBeenCalledWith([['someotherkey', 100, 120], ['someotherkey', 150, 200]], 100, 200);
                    expect(TimeFrameCache.prototype._getFromCache).toHaveBeenCalledWith(keys, 100, 200);
                }).catch(function() {
                    fail('The promise failed!');
                }).finally(function() {
                    done();
                });
            });

            it('stores download results in the cache before trying to read it', function(done) {
                var callLog = [];
                spyOn(TimeFrameCache.prototype, '_downloadRequired').and.returnValues([[10, 20]]);
                // Mock the _downloadAndUpdateCache contents
                spyOn(TimeFrameCache.prototype, '_mergeInCache').and.callFake(function() { 
                    callLog.push('_mergeInCache');
                });
                var downloader = jasmine.createSpy('downloader').and.returnValue(new RSVP.Promise(function(resolve) {
                    callLog.push('getLogs');
                    resolve({
                        somekey: []
                    });
                }));
                spyOn(TimeFrameCache.prototype, '_getFromCache').and.callFake(function() {
                    callLog.push('_getFromCache');
                    return 'ok';
                });
                var manager = new TimeFrameCache(downloader);

                var promise = manager.get(['somekey'], 100.2, 199.5);

                promise.then(function(result) {
                    expect(result).toBe('ok');
                    expect(callLog).toEqual(['getLogs', '_mergeInCache', '_getFromCache']);
                }).catch(function() {
                    fail('The promise failed!');
                }).finally(function() {
                    done();
                });

            });
        });

        describe('reads values at a specified time point (getAtPoint)', function() {
            it('returns null for non-cached points', function() {
                var tfc = new TimeFrameCache();
                tfc.cache.somekey = [
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

                var result = tfc.getAtTime(['unknown', 'somekey'], 700);

                expect(result).toEqual({
                    unknown: [],
                    somekey: [],
                });
            });

            it('returns one element arrays when the requested time exists in the cache', function() {
                var tfc = new TimeFrameCache();
                tfc.cache.somekey = [
                    {
                        start: 200,
                        end: 500,
                        entries: [
                            { time: 210 },
                            { time: 250, value: 'ok' },
                            { time: 360 },
                            { time: 470 },
                        ],
                    },
                ];

                var result = tfc.getAtTime(['somekey'], 250);

                expect(result).toEqual({
                    somekey: [{ time: 250, value: 'ok' }],
                });
            });

            it('returns two elements arrays when the requested time is between two cached values', function() {
                var tfc = new TimeFrameCache();
                tfc.cache.somekey = [
                    {
                        start: 200,
                        end: 500,
                        entries: [
                            { time: 210 },
                            { time: 250, value: 'ok' },
                            { time: 360, value: 'ye' },
                            { time: 470 },
                        ],
                    },
                ];

                tfc.cache.keybefore = [
                    {
                        start: 200,
                        end: 500,
                        entries: [
                            { time: 210 },
                            { time: 250, value: 'before' },
                        ],
                    },
                ];
                
                tfc.cache.keyafter = [
                    {
                        start: 200,
                        end: 500,
                        entries: [
                            { time: 360, value: 'after' },
                            { time: 470 },
                        ],
                    },
                ];
                
                var result = tfc.getAtTime(['somekey', 'keybefore', 'keyafter'], 300);

                expect(result).toEqual({
                    somekey: [
                            { time: 250, value: 'ok' },
                            { time: 360, value: 'ye' },
                    ],
                    keybefore: [{ time: 250, value: 'before' }, null],
                    keyafter: [null, { time: 360, value: 'after' }],
                });
            });

            it('returns deep copies of the actual cache, preventing modifications from outside through returned values', function() {
                var tfc = new TimeFrameCache();
                tfc.cache.somekey = [
                    {
                        start: 200,
                        end: 500,
                        entries: [
                            { time: 210 },
                            { time: 250, value: 'ok' },
                            { time: 360, value: 'ye' },
                            { time: 470 },
                        ],
                    },
                ];

                var results = tfc.getAtTime(['somekey'], 300);

                results.somekey[0].value = 1;
                results.somekey[1].value = 2;

                expect(tfc.cache.somekey[0].entries[1].value).toBe('ok');
                expect(tfc.cache.somekey[0].entries[2].value).toBe('ye');
            });
        });
    });
});
