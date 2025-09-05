-- This migration removes obsolete RPC functions that are no longer used by the application.

DROP FUNCTION IF EXISTS get_leaderboard(integer, text);
DROP FUNCTION IF EXISTS get_simulations(text);
