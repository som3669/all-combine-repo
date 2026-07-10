package com.aipatro.ai_patro

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetPlugin

class AiPatroWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (widgetId in appWidgetIds) {
            val prefs = HomeWidgetPlugin.getData(context)
            val views = RemoteViews(context.packageName, R.layout.ai_patro_widget).apply {
                setTextViewText(R.id.widget_bs_day, prefs.getString("bs_day", "?"))
                setTextViewText(R.id.widget_bs_month_year, prefs.getString("bs_month_year", ""))
                setTextViewText(R.id.widget_ad_date, prefs.getString("ad_date", ""))
            }
            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }
}
