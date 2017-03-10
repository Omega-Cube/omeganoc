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
/* global describe it expect spyOn */

define(['probes.manager', 'timeframecache'], function(ProbesManager, TimeFrameCache) {
    describe('The Probes Manager', function() {
        describe('single time point retrieval (getAtTime)', function() {
            it('returns data inside the 10 minutes window', function() {
                spyOn(TimeFrameCache.prototype, 'getAtTime').and.returnValue({
                    nocache: [],
                    spoton: [{ time: 500, value: 'noice' }],
                    dualnone: [null, null],
                    dualbefore: [{time: 200, value: 'before'}, null],
                    dualafter: [null, {time: 800, value: 'after'}],
                    dualboth: [
                        {time: 220, value: 'before'},
                        {time: 760, value: 'after'},
                    ]
                });

                var manager = new ProbesManager();

                var result = manager.getAtTime(['nocache', 'spoton', 'dualnone', 'dualbefore', 'dualafter', 'dualboth'], 500);

                expect(result).toEqual({
                    nocache: null,
                    spoton: 'noice',
                    dualnone: null,
                    dualbefore: 'before',
                    dualafter: 'after',
                    dualboth: 'after',
                });
            });

            it('rejects data outside the 10 minutes window', function() {
                spyOn(TimeFrameCache.prototype, 'getAtTime').and.returnValue({
                    dualbefore: [{time: 199, value: 'before'}, null],
                    dualafter: [null, {time: 801, value: 'after'}],
                    dualboth: [
                        {time: 180, value: 'before'},
                        {time: 900, value: 'after'},
                    ]
                });

                var manager = new ProbesManager();

                var result = manager.getAtTime(['dualbefore', 'dualafter', 'dualboth'], 500);

                expect(result).toEqual({
                    dualbefore: null,
                    dualafter: null,
                    dualboth: null,
                });
            });

        });

        describe('probe interval detection', function() {
            it('works (filled data set)', function() {
                var manager = new ProbesManager();

                manager.cache = {
                    cache: {
                        somekey: [
                            {
                                start: 100,
                                end: 1100,
                                entries: [
                                    { time: 105 },
                                    { time: 314 },
                                    { time: 605 },
                                    { time: 906 },
                                ]
                            },
                            {
                                start: 5000,
                                end: 8500,
                                entries: [
                                    { time: 5020 },
                                    { time: 5341 },
                                    { time: 5630 },
                                    { time: 5905 },
                                    { time: 6240 },
                                    { time: 6560 },
                                    { time: 6882 },
                                    { time: 7115 },
                                    { time: 7395 },
                                    { time: 7721 },
                                    { time: 8011 },
                                    { time: 8300 },
                                ]
                            },
                        ]
                    }
                };

                manager._updateNativeInterval('somekey');

                expect(manager.nativeIntervals.somekey).toBe(5);
            });

            it('works (empty data set)', function() {
                var manager = new ProbesManager();

                manager.cache = {
                    cache: {
                        somekey: [
                            {
                                start: 100,
                                end: 1100,
                                entries: [
                                ]
                            },
                            {
                                start: 5000,
                                end: 8500,
                                entries: [
                                    { time: 6240 },
                                ]
                            },
                        ]
                    }
                };

                manager._updateNativeInterval('somekey');

                expect(manager.nativeIntervals.somekey).toBeNull();
            });
        });

        describe('aggregated time series generation', function() {
            it('can handle empty source data', function() {
                var manager = new ProbesManager();
                manager.nativeIntervals['somekey'] = 10;

                var result = manager._getAggregatedUnit('somekey', [], 1000, 3000, 100);

                expect(result).toEqual({
                    start: 1000,
                    step: 100,
                    points: [
                        null, null, null, null, null, null, null, null, null, null, 
                        null, null, null, null, null, null, null, null, null, null, 
                    ]
                });
            });

            it('prevents the step to be more precise than the natural step', function() {
                var manager = new ProbesManager();
                manager.nativeIntervals['somekey'] = 10;

                var result = manager._getAggregatedUnit('somekey', [], 1000, 2000, 5);

                expect(result.step).toBe(10);
            });

            it('works, with the MAX aggregation mode', function() {
                var manager = new ProbesManager();
                manager.nativeIntervals['somekey'] = 10;

                var result = manager._getAggregatedUnit('somekey', [
                    { time: 1010, value: 80 },
                    { time: 1250, value: 12 },
                    { time: 1280, value: 90 },
                    { time: 1400, value: 60 },
                    { time: 1466, value: 40 },
                    { time: 1477, value: 20 },
                ], 1000, 1500, 100, ProbesManager.aggregationModes.MAX);

                expect(result.points).toEqual([
                    80,
                    null,
                    90,
                    null,
                    60,
                ]);
            });

            it('works, with the MIN aggregation mode', function() {
                var manager = new ProbesManager();
                manager.nativeIntervals['somekey'] = 10;

                var result = manager._getAggregatedUnit('somekey', [
                    { time: 1010, value: 80 },
                    { time: 1250, value: 12 },
                    { time: 1280, value: 90 },
                    { time: 1400, value: 60 },
                    { time: 1466, value: 40 },
                    { time: 1477, value: 20 },
                ], 1000, 1500, 100, ProbesManager.aggregationModes.MIN);

                expect(result.points).toEqual([
                    80,
                    null,
                    12,
                    null,
                    20,
                ]);
            });

            it('works, with the AVG aggregation mode', function() {
                var manager = new ProbesManager();
                manager.nativeIntervals['somekey'] = 10;

                var result = manager._getAggregatedUnit('somekey', [
                    { time: 1010, value: 80 },
                    { time: 1250, value: 12 },
                    { time: 1280, value: 90 },
                    { time: 1400, value: 60 },
                    { time: 1466, value: 40 },
                    { time: 1477, value: 20 },
                ], 1000, 1500, 100, ProbesManager.aggregationModes.AVG);

                expect(result.points).toEqual([
                    80,
                    null,
                    51,
                    null,
                    40,
                ]);
            });

            it('generates aggregates on several keys', function() {
                spyOn(ProbesManager.prototype, '_getAggregatedUnit').and.returnValues('result1', 'result2', 'result3');
                spyOn(TimeFrameCache.prototype, 'get').and.returnValue({
                    probe1: 'source1',
                    probe2: 'source2',
                    probe3: 'source3',
                });
                var manager = new ProbesManager();
                
                var result = manager.getAggregated(['probe1', 'probe2', 'probe3'], 100, 5000, 100);

                expect(result).toEqual({
                    probe1: 'result1',
                    probe2: 'result2',
                    probe3: 'result3'
                });

                expect(ProbesManager.prototype._getAggregatedUnit).toHaveBeenCalledTimes(3);
                expect(TimeFrameCache.prototype.get).toHaveBeenCalledWith(['probe1', 'probe2', 'probe3'], 100, 5000);
                expect(ProbesManager.prototype._getAggregatedUnit.calls.allArgs()).toEqual([
                    ['probe1', 'source1', 100, 5000, 100, ProbesManager.aggregationModes.MAX],
                    ['probe2', 'source2', 100, 5000, 100, ProbesManager.aggregationModes.MAX],
                    ['probe3', 'source3', 100, 5000, 100, ProbesManager.aggregationModes.MAX]
                ]);
            });
        });
    });
});