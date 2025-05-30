/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5map from "@amcharts/amcharts5/map";
import am5geodata_worldLow from "@amcharts/amcharts5-geodata/worldLow";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Globe, TrendingUp, TrendingDown, Minus, BarChart3, MapPin, Palette, Home } from "lucide-react";

// Types
interface RegionData {
    country: string;
    region: string;
    sentiment: number;
    sentimentLabel: string;
    color: string;
}

interface CountrySummary {
    positive: number;
    neutral: number;
    negative: number;
    total: number;
}

interface HoveredRegion extends CountrySummary {
    country: string;
}

interface SentimentConfig {
    label: string;
    color: string;
    icon: React.ComponentType<{ className?: string }>;
}

// Country ISO code mapping for amCharts
const COUNTRY_ISO_MAPPING: Record<string, string> = {
    "United States": "US",
    "United Kingdom": "GB",
    Canada: "CA",
    Australia: "AU",
    Germany: "DE",
    France: "FR",
    Japan: "JP",
    China: "CN",
    India: "IN",
    Brazil: "BR",
    Mexico: "MX",
    Russia: "RU",
    Italy: "IT",
    Spain: "ES",
    "South Korea": "KR",
    Netherlands: "NL",
    "Saudi Arabia": "SA",
    "South Africa": "ZA",
    Turkey: "TR",
};

const SENTIMENT_CONFIG: Record<number, SentimentConfig> = {
    0: { label: "Negative", color: "#dc2626", icon: TrendingDown },
    1: { label: "Neutral", color: "#ca8a04", icon: Minus },
    2: { label: "Positive", color: "#16a34a", icon: TrendingUp },
};

const VISUALIZATION_TYPES = {
    overall: "Overall Sentiment",
    positive: "Positive Focus",
    negative: "Negative Focus",
    neutral: "Neutral Focus",
};

const Dashboard: React.FC = () => {
    const chartRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<am5.Root | null>(null);
    const [data, setData] = useState<RegionData[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
    const [visualizationType, setVisualizationType] = useState<string>("overall");
    const [hoveredRegion, setHoveredRegion] = useState<HoveredRegion | null>(null);
    const [countrySummary, setCountrySummary] = useState<Record<string, CountrySummary>>({});
    const [mapInstance, setMapInstance] = useState<am5map.MapChart | null>(null);

    // Load and process CSV data
    useEffect(() => {
        const loadData = async (): Promise<void> => {
            try {
                setLoading(true);
                setError(null);

                // Fetch CSV from public folder
                const response = await fetch("/geo_sentiments.csv");
                if (!response.ok) {
                    throw new Error(`Failed to fetch CSV file: ${response.status}`);
                }
                const csvContent = await response.text();

                // Parse CSV
                const Papa = await import("papaparse");
                const result = Papa.default.parse(csvContent, {
                    header: true,
                    dynamicTyping: true,
                    skipEmptyLines: true,
                    delimitersToGuess: [",", "\t", "|", ";"],
                });

                if (result.errors.length > 0) {
                    console.warn("CSV parsing warnings:", result.errors);
                    const criticalErrors = result.errors.filter(
                        (error: any) => error.type === "Quotes" || error.type === "FieldMismatch"
                    );
                    if (criticalErrors.length > 0) {
                        throw new Error("Critical errors parsing CSV data");
                    }
                }

                // Clean and process data
                const processedData: RegionData[] = result.data
                    .filter((row: any) => row.Country && row.Region && row.RandomValue !== null)
                    .map((row: any) => ({
                        country: String(row.Country).trim(),
                        region: String(row.Region).trim(),
                        sentiment: Number(row.RandomValue),
                        sentimentLabel: SENTIMENT_CONFIG[Number(row.RandomValue)]?.label || "Unknown",
                        color: SENTIMENT_CONFIG[Number(row.RandomValue)]?.color || "#6b7280",
                    }));

                // Calculate country summaries
                const summary: Record<string, CountrySummary> = {};
                processedData.forEach((item) => {
                    if (!summary[item.country]) {
                        summary[item.country] = { positive: 0, neutral: 0, negative: 0, total: 0 };
                    }
                    summary[item.country].total++;
                    if (item.sentiment === 2) summary[item.country].positive++;
                    else if (item.sentiment === 1) summary[item.country].neutral++;
                    else if (item.sentiment === 0) summary[item.country].negative++;
                });

                setData(processedData);
                setCountrySummary(summary);
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
                setError(`Failed to load data: ${errorMessage}`);
                console.error("Data loading error:", err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    // Calculate country color based on visualization type
    const getCountryColor = useCallback(
        (countryData: CountrySummary): string => {
            const { positive, neutral, negative, total } = countryData;

            switch (visualizationType) {
                case "positive":
                    const positiveRatio = positive / total;
                    if (positiveRatio >= 0.7) return SENTIMENT_CONFIG[2].color;
                    if (positiveRatio >= 0.4) return "#84cc16";
                    return "#e5e5e5";

                case "negative":
                    const negativeRatio = negative / total;
                    if (negativeRatio >= 0.7) return SENTIMENT_CONFIG[0].color;
                    if (negativeRatio >= 0.4) return "#f87171";
                    return "#e5e5e5";

                case "neutral":
                    const neutralRatio = neutral / total;
                    if (neutralRatio >= 0.7) return SENTIMENT_CONFIG[1].color;
                    if (neutralRatio >= 0.4) return "#fbbf24";
                    return "#e5e5e5";

                default: // overall
                    const avgSentiment = (positive * 2 + neutral * 1 + negative * 0) / total;
                    if (avgSentiment >= 1.5) return SENTIMENT_CONFIG[2].color;
                    if (avgSentiment >= 0.5) return SENTIMENT_CONFIG[1].color;
                    return SENTIMENT_CONFIG[0].color;
            }
        },
        [visualizationType]
    );

    // Initialize amCharts map
    useEffect(() => {
        if (!data.length || loading || !chartRef.current) return;

        const initializeMap = async (): Promise<void> => {
            try {
                // Dispose previous chart
                if (rootRef.current) {
                    rootRef.current.dispose();
                }

                // Create root element
                const root = am5.Root.new(chartRef.current!);
                rootRef.current = root;

                // Set themes
                root.setThemes([am5themes_Animated.new(root)]);

                // Create chart
                const chart = root.container.children.push(
                    am5map.MapChart.new(root, {
                        panX: "translateX",
                        panY: "translateY",
                        projection: am5map.geoMercator(),
                        homeZoomLevel: 1,
                        homeGeoPoint: { longitude: 0, latitude: 20 },
                        maxZoomLevel: 8,
                        wheelX: "zoom",
                        wheelY: "zoom",
                    })
                );

                setMapInstance(chart);

                // Create polygon series for countries
                const polygonSeries = chart.series.push(
                    am5map.MapPolygonSeries.new(root, {
                        geoJSON: am5geodata_worldLow,
                    })
                );

                // Configure polygon template with better performance
                polygonSeries.mapPolygons.template.setAll({
                    tooltipText: "{name}",
                    fill: am5.color("#e5e5e5"),
                    stroke: am5.color("#ffffff"),
                    strokeWidth: 0.5,
                    interactive: true,
                    cursorOverStyle: "pointer",
                });

                // Optimized hover states
                polygonSeries.mapPolygons.template.states.create("hover", {
                    fill: am5.color("#64748b"),
                    stroke: am5.color("#1e293b"),
                    strokeWidth: 1.5,
                });

                // Color countries based on sentiment data
                polygonSeries.mapPolygons.template.adapters.add("fill", (fill, target) => {
                    const countryId = (target.dataItem?.dataContext as { id?: string })?.id;
                    const countryData = Object.keys(COUNTRY_ISO_MAPPING).find(
                        (key) => COUNTRY_ISO_MAPPING[key] === countryId
                    );

                    if (countryData && countrySummary[countryData]) {
                        return am5.color(getCountryColor(countrySummary[countryData]));
                    }

                    return am5.color("#f1f5f9");
                });

                // Enhanced click handler
                polygonSeries.mapPolygons.template.events.on("click", (ev) => {
                    const countryId = (ev.target.dataItem?.dataContext as { id?: string })?.id;
                    const countryName = Object.keys(COUNTRY_ISO_MAPPING).find(
                        (key) => COUNTRY_ISO_MAPPING[key] === countryId
                    );

                    if (countryName && countrySummary[countryName]) {
                        setSelectedCountry((prev) => (prev === countryName ? null : countryName));

                        // Smooth zoom to country using correct amCharts method
                        const polygon = ev.target;
                        if (polygon && polygon.dataItem?.dataContext) {
                            try {
                                chart.zoomToGeoPoint({ longitude: 0, latitude: 0 }, 2, true);
                            } catch (error) {
                                console.warn("Zoom operation failed:", error);
                            }
                        }
                    }
                });

                // Enhanced hover handler with debouncing
                let hoverTimeout: NodeJS.Timeout;
                polygonSeries.mapPolygons.template.events.on("pointerover", (ev) => {
                    clearTimeout(hoverTimeout);
                    hoverTimeout = setTimeout(() => {
                        const countryId = (ev.target.dataItem?.dataContext as { id?: string })?.id;
                        const countryName = Object.keys(COUNTRY_ISO_MAPPING).find(
                            (key) => COUNTRY_ISO_MAPPING[key] === countryId
                        );

                        if (countryName && countrySummary[countryName]) {
                            setHoveredRegion({
                                country: countryName,
                                ...countrySummary[countryName],
                            });
                        }
                    }, 100);
                });

                polygonSeries.mapPolygons.template.events.on("pointerout", () => {
                    clearTimeout(hoverTimeout);
                    setHoveredRegion(null);
                });

                // Add zoom controls with custom styling
                const zoomControl = chart.set("zoomControl", am5map.ZoomControl.new(root, {}));
                zoomControl.homeButton.set("visible", true);

                // Customize zoom control appearance
                zoomControl.plusButton.setAll({
                    paddingTop: 8,
                    paddingBottom: 8,
                    paddingLeft: 12,
                    paddingRight: 12,
                });

                // Performance optimization
                chart.chartContainer.get("background")?.setAll({
                    fill: am5.color("#f8fafc"),
                    fillOpacity: 1,
                });

                // Disable unnecessary animations for better performance
                polygonSeries.set("animationDuration" as any, 200);
            } catch (err) {
                setError("Failed to initialize map visualization.");
                console.error("Map initialization error:", err);
            }
        };

        initializeMap();

        return () => {
            if (rootRef.current) {
                rootRef.current.dispose();
                rootRef.current = null;
            }
        };
    }, [data, countrySummary, visualizationType, getCountryColor]);

    // Utility functions
    const getCountryRegions = useCallback(
        (countryName: string): RegionData[] => {
            return data.filter((item) => item.country === countryName);
        },
        [data]
    );

    const getSentimentStats = useCallback((regions: RegionData[]): CountrySummary => {
        const stats = { positive: 0, neutral: 0, negative: 0, total: regions.length };
        regions.forEach((region) => {
            if (region.sentiment === 2) stats.positive++;
            else if (region.sentiment === 1) stats.neutral++;
            else if (region.sentiment === 0) stats.negative++;
        });
        return stats;
    }, []);

    const resetMapView = (): void => {
        if (mapInstance) {
            mapInstance.zoomToGeoBounds(mapInstance.geoBounds(), 1);
        }
        setSelectedCountry(null);
    };

    const getGlobalStats = useCallback((): CountrySummary => {
        return Object.values(countrySummary).reduce(
            (acc, country) => ({
                positive: acc.positive + country.positive,
                neutral: acc.neutral + country.neutral,
                negative: acc.negative + country.negative,
                total: acc.total + country.total,
            }),
            { positive: 0, neutral: 0, negative: 0, total: 0 }
        );
    }, [countrySummary]);

    // Loading state
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
                <Card className="p-8 shadow-lg">
                    <div className="text-center">
                        <Loader2 className="h-12 w-12 animate-spin mx-auto mb-6 text-blue-600" />
                        <h2 className="text-xl font-semibold mb-2">Loading Sentiment Data</h2>
                        <p className="text-gray-600">Preparing your global sentiment dashboard...</p>
                    </div>
                </Card>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 p-6 flex items-center justify-center">
                <Card className="max-w-2xl mx-auto shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-red-600 flex items-center gap-2">
                            <AlertDescription className="h-5 w-5" />
                            Error Loading Dashboard
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Alert className="border-red-200">
                            <AlertDescription className="text-red-700">{error}</AlertDescription>
                        </Alert>
                        <Button onClick={() => window.location.reload()} className="mt-4 w-full" variant="outline">
                            Retry Loading
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const selectedCountryRegions = selectedCountry ? getCountryRegions(selectedCountry) : [];
    const selectedCountryStats = selectedCountryRegions.length > 0 ? getSentimentStats(selectedCountryRegions) : null;
    const globalStats = getGlobalStats();

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
            <div className="max-w-7xl mx-auto p-6 space-y-6">
                {/* Enhanced Header */}
                <div className="text-center py-8">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <div className="p-3 bg-blue-600 rounded-full">
                            <Globe className="h-8 w-8 text-white" />
                        </div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            Global Sentiment Analysis
                        </h1>
                    </div>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                        Interactive visualization of regional sentiment data across {Object.keys(countrySummary).length}{" "}
                        countries and {data.length} regions worldwide
                    </p>
                </div>

                {/* Enhanced Controls */}
                <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <CardTitle className="flex items-center gap-2 text-xl">
                                <Palette className="h-6 w-6 text-blue-600" />
                                Visualization Controls
                            </CardTitle>
                            <div className="flex items-center gap-3">
                                <Button
                                    onClick={resetMapView}
                                    variant="outline"
                                    size="sm"
                                    className="flex items-center gap-2"
                                >
                                    <Home className="h-4 w-4" />
                                    Reset View
                                </Button>
                                <Select value={visualizationType} onValueChange={setVisualizationType}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue placeholder="Visualization type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(VISUALIZATION_TYPES).map(([key, label]) => (
                                            <SelectItem key={key} value={key}>
                                                {label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap items-center gap-6">
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-medium text-gray-700">Color Legend:</span>
                                {Object.entries(SENTIMENT_CONFIG).map(([value, config]) => {
                                    const Icon = config.icon;
                                    return (
                                        <div
                                            key={value}
                                            className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-full"
                                        >
                                            <div
                                                className="w-4 h-4 rounded-full shadow-sm"
                                                style={{ backgroundColor: config.color }}
                                            />
                                            <Icon className="h-4 w-4 text-gray-600" />
                                            <span className="text-sm font-medium">{config.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                    {/* Map Section */}
                    <Card className="xl:col-span-3 shadow-lg border-0 bg-white/90 backdrop-blur-sm">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-xl flex items-center gap-2">
                                        <MapPin className="h-5 w-5 text-blue-600" />
                                        Interactive World Map
                                    </CardTitle>
                                    <p className="text-sm text-gray-600 mt-1">
                                        Click countries for details • Hover for quick stats • Zoom and pan to explore
                                    </p>
                                </div>
                                <Badge variant="outline" className="hidden sm:flex">
                                    {VISUALIZATION_TYPES[visualizationType as keyof typeof VISUALIZATION_TYPES]}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div
                                ref={chartRef}
                                className="w-full border rounded-xl shadow-inner bg-slate-50"
                                style={{ height: "500px" }}
                            />
                        </CardContent>
                    </Card>

                    {/* Enhanced Info Panel */}
                    <div className="space-y-6">
                        {/* Global Summary */}
                        <Card className="shadow-lg border-0 bg-gradient-to-br from-blue-50 to-indigo-50">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <BarChart3 className="h-5 w-5 text-blue-600" />
                                    Global Overview
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3 text-center">
                                        <div className="p-3 bg-white rounded-lg shadow-sm">
                                            <div className="text-2xl font-bold text-blue-600">
                                                {Object.keys(countrySummary).length}
                                            </div>
                                            <div className="text-xs text-gray-600">Countries</div>
                                        </div>
                                        <div className="p-3 bg-white rounded-lg shadow-sm">
                                            <div className="text-2xl font-bold text-purple-600">{data.length}</div>
                                            <div className="text-xs text-gray-600">Regions</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div className="p-2 bg-green-50 rounded-lg border border-green-200">
                                            <div className="text-lg font-bold text-green-700">
                                                {globalStats.positive}
                                            </div>
                                            <div className="text-xs text-green-600">Positive</div>
                                        </div>
                                        <div className="p-2 bg-yellow-50 rounded-lg border border-yellow-200">
                                            <div className="text-lg font-bold text-yellow-700">
                                                {globalStats.neutral}
                                            </div>
                                            <div className="text-xs text-yellow-600">Neutral</div>
                                        </div>
                                        <div className="p-2 bg-red-50 rounded-lg border border-red-200">
                                            <div className="text-lg font-bold text-red-700">{globalStats.negative}</div>
                                            <div className="text-xs text-red-600">Negative</div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Hover Information */}
                        {hoveredRegion && (
                            <Card className="shadow-lg border-0 bg-gradient-to-br from-purple-50 to-pink-50 animate-in slide-in-from-right duration-200">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <MapPin className="h-5 w-5 text-purple-600" />
                                        {hoveredRegion.country}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium">Total Regions:</span>
                                            <Badge variant="outline" className="font-bold">
                                                {hoveredRegion.total}
                                            </Badge>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div className="p-2 bg-green-100 rounded border border-green-300">
                                                <div className="text-sm font-bold text-green-700">
                                                    {hoveredRegion.positive}
                                                </div>
                                                <div className="text-xs text-green-600">Positive</div>
                                            </div>
                                            <div className="p-2 bg-yellow-100 rounded border border-yellow-300">
                                                <div className="text-sm font-bold text-yellow-700">
                                                    {hoveredRegion.neutral}
                                                </div>
                                                <div className="text-xs text-yellow-600">Neutral</div>
                                            </div>
                                            <div className="p-2 bg-red-100 rounded border border-red-300">
                                                <div className="text-sm font-bold text-red-700">
                                                    {hoveredRegion.negative}
                                                </div>
                                                <div className="text-xs text-red-600">Negative</div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Selected Country Details */}
                        {selectedCountry && selectedCountryStats && (
                            <Card className="shadow-lg border-0 bg-gradient-to-br from-green-50 to-emerald-50 animate-in slide-in-from-bottom duration-300">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg">{selectedCountry}</CardTitle>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSelectedCountry(null)}
                                            className="hover:bg-red-100"
                                        >
                                            ✕
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-3 gap-3 text-center">
                                            <div className="p-4 bg-green-100 rounded-lg border border-green-300 shadow-sm">
                                                <TrendingUp className="h-6 w-6 text-green-600 mx-auto mb-1" />
                                                <div className="text-2xl font-bold text-green-700">
                                                    {selectedCountryStats.positive}
                                                </div>
                                                <div className="text-xs text-green-600 font-medium">Positive</div>
                                            </div>
                                            <div className="p-4 bg-yellow-100 rounded-lg border border-yellow-300 shadow-sm">
                                                <Minus className="h-6 w-6 text-yellow-600 mx-auto mb-1" />
                                                <div className="text-2xl font-bold text-yellow-700">
                                                    {selectedCountryStats.neutral}
                                                </div>
                                                <div className="text-xs text-yellow-600 font-medium">Neutral</div>
                                            </div>
                                            <div className="p-4 bg-red-100 rounded-lg border border-red-300 shadow-sm">
                                                <TrendingDown className="h-6 w-6 text-red-600 mx-auto mb-1" />
                                                <div className="text-2xl font-bold text-red-700">
                                                    {selectedCountryStats.negative}
                                                </div>
                                                <div className="text-xs text-red-600 font-medium">Negative</div>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                                                <MapPin className="h-4 w-4" />
                                                Regional Breakdown ({selectedCountryRegions.length} regions)
                                            </h4>
                                            <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                                                {selectedCountryRegions.map((region, index) => {
                                                    const Icon = SENTIMENT_CONFIG[region.sentiment].icon;
                                                    return (
                                                        <div
                                                            key={index}
                                                            className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <Icon className="h-4 w-4" />
                                                                <span className="text-sm font-medium">
                                                                    {region.region}
                                                                </span>
                                                            </div>
                                                            <Badge
                                                                style={{
                                                                    backgroundColor: region.color,
                                                                    color: "white",
                                                                }}
                                                                className="text-xs font-medium"
                                                            >
                                                                {region.sentimentLabel}
                                                            </Badge>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>

                {/* Instructions */}
                <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="text-center text-sm text-gray-600">
                            <p className="mb-2">
                                <strong>How to use:</strong> Click on countries to view detailed regional breakdown •
                                Hover over countries for quick statistics • Use zoom controls to explore regions
                            </p>
                            <p className="text-xs opacity-75">
                                Data represents sentiment analysis across {Object.keys(countrySummary).length} countries
                                with {data.length} regional data points
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default Dashboard;
