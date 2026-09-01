import os
from glob import glob
from setuptools import find_packages, setup

package_name = 'sabertooth_driver'

setup(
    name=package_name,
    version='1.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.launch.py')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='ubuntu',
    maintainer_email='ubuntu@todo.todo',
    description='ROS 2 Jazzy driver node for Dimension Engineering Sabertooth 2x32',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'sabertooth_node = sabertooth_driver.sabertooth_node:main',
        ],
    },
)
