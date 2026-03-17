export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
  guardianIds: string[];
}

export interface Guardian {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string;
  vehicleModel: string;
  licensePlate: string;
  studentIds: string[];
}

export interface Pickup {
  id: string;
  studentId: string;
  guardianId: string;
  timestamp: string;
  status: 'pending' | 'announced' | 'completed';
}
