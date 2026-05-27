// src/front/hooks/useNotifications.jsx
import { useEffect } from 'react';
import useGlobalReducer from './useGlobalReducer.jsx'; 

export const useNotifications = () => {
    const { store, dispatch } = useGlobalReducer(); 

    // Ajusta la variable de entorno según cómo la tengas en tu proyecto (VITE_BACKEND_URL o similar)
    const API_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001/api";

    const fetchNotifications = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch(`${API_URL}/notifications`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                dispatch({ type: 'set_notifications', payload: data });
            }
        } catch (error) {
            console.error("Error al obtener notificaciones:", error);
        }
    };

    const markAsRead = async (id) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/notifications/${id}/read`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                dispatch({ type: 'remove_notification', payload: id });
            }
        } catch (error) {
            console.error("Error al marcar como leída:", error);
        }
    };

    return { 
        fetchNotifications, 
        markAsRead, 
        notifications: store.notifications,
        unreadCount: store.unreadCount
    };
};